"""
PatchCore(Roth et al., CVPR 2022)精簡實作。
  1. 用 ImageNet 預訓練 WideResNet-50 取中層特徵(layer2 + layer3),3×3 局部聚合
  2. 把所有 OK 件的 patch 特徵存進記憶庫,貪婪 k-center 抽樣壓到 ~10%
  3. 測試:每個 patch 到記憶庫最近距離 = 異常分數;patch 圖上採樣 + 高斯模糊 = 異常熱圖
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
import numpy as np
import torch
import torch.nn.functional as F
import torchvision
import cv2


class FeatureExtractor(torch.nn.Module):
    def __init__(self, device: torch.device):
        super().__init__()
        w = torchvision.models.Wide_ResNet50_2_Weights.IMAGENET1K_V1
        m = torchvision.models.wide_resnet50_2(weights=w)
        self.stem = torch.nn.Sequential(m.conv1, m.bn1, m.relu, m.maxpool)
        self.layer1, self.layer2, self.layer3 = m.layer1, m.layer2, m.layer3
        self.eval().to(device)
        for p in self.parameters():
            p.requires_grad_(False)
        self.device = device

    @torch.no_grad()
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """回傳 (B, C, H/8, W/8) 的 patch 特徵。"""
        x = x.to(self.device)
        x = self.stem(x)
        x = self.layer1(x)
        f2 = self.layer2(x)
        f3 = self.layer3(f2)
        f2 = F.avg_pool2d(f2, 3, stride=1, padding=1)
        f3 = F.avg_pool2d(f3, 3, stride=1, padding=1)
        f3 = F.interpolate(f3, size=f2.shape[-2:], mode="bilinear", align_corners=False)
        f = torch.cat([f2, f3], dim=1)  # 512 + 1024 = 1536
        # 通道降到 1024(論文做法:自適應平均池化)
        B, C, H, W = f.shape
        f = f.permute(0, 2, 3, 1).reshape(-1, 1, C)
        f = F.adaptive_avg_pool1d(f, 1024).reshape(B, H, W, 1024).permute(0, 3, 1, 2)
        return f


@torch.no_grad()
def greedy_coreset(feats: torch.Tensor, ratio: float, proj_dim: int = 128, seed: int = 0) -> torch.Tensor:
    """貪婪 k-center 抽樣(先隨機投影降維加速)。回傳被選中的索引。"""
    n = feats.shape[0]
    k = max(1, int(n * ratio))
    g = torch.Generator(device=feats.device).manual_seed(seed)
    P = torch.randn(feats.shape[1], proj_dim, generator=g, device=feats.device) / math.sqrt(proj_dim)
    z = feats @ P
    idx = torch.empty(k, dtype=torch.long, device=feats.device)
    idx[0] = torch.randint(n, (1,), generator=g, device=feats.device)
    mind = torch.cdist(z, z[idx[0]].unsqueeze(0)).squeeze(1)
    for i in range(1, k):
        j = torch.argmax(mind)
        idx[i] = j
        d = torch.cdist(z, z[j].unsqueeze(0)).squeeze(1)
        mind = torch.minimum(mind, d)
    return idx


@dataclass
class PatchCoreModel:
    memory: torch.Tensor  # (M, 1024)
    size: int
    fmap: int  # 特徵圖邊長(size/8)
    polar: bool
    image_threshold: float | None = None
    pixel_threshold: float | None = None
    calib: dict = field(default_factory=dict)

    def save(self, path: str):
        torch.save({"memory": self.memory.cpu(), "size": self.size, "fmap": self.fmap, "polar": self.polar,
                    "image_threshold": self.image_threshold, "pixel_threshold": self.pixel_threshold, "calib": self.calib}, path)

    @staticmethod
    def load(path: str, device: torch.device) -> "PatchCoreModel":
        d = torch.load(path, map_location=device)
        return PatchCoreModel(memory=d["memory"].to(device), size=d["size"], fmap=d["fmap"], polar=d["polar"],
                              image_threshold=d.get("image_threshold"), pixel_threshold=d.get("pixel_threshold"), calib=d.get("calib", {}))


class PatchCore:
    def __init__(self, device: torch.device | None = None, size: int = 256, polar: bool = False):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.extractor = FeatureExtractor(self.device)
        self.size = size
        self.polar = polar
        self.model: PatchCoreModel | None = None

    @torch.no_grad()
    def _feats(self, batch: torch.Tensor) -> torch.Tensor:
        return self.extractor(batch)

    @torch.no_grad()
    def fit(self, tensors: list[torch.Tensor], coreset_ratio: float = 0.1, batch: int = 16, log=print) -> PatchCoreModel:
        allf = []
        for i in range(0, len(tensors), batch):
            f = self._feats(torch.stack(tensors[i:i + batch]))
            B, C, H, W = f.shape
            allf.append(f.permute(0, 2, 3, 1).reshape(-1, C))
            log(f"  特徵擷取 {min(i + batch, len(tensors))}/{len(tensors)}")
        feats = torch.cat(allf)
        fmap = H
        log(f"  記憶庫原始 {feats.shape[0]:,} patch × {feats.shape[1]} 維,貪婪抽樣 {coreset_ratio:.0%} …")
        idx = greedy_coreset(feats, coreset_ratio)
        mem = feats[idx].contiguous()
        log(f"  記憶庫 {mem.shape[0]:,} patch")
        self.model = PatchCoreModel(memory=mem, size=self.size, fmap=fmap, polar=self.polar)
        return self.model

    @torch.no_grad()
    def score(self, tensors: list[torch.Tensor], batch: int = 16, chunk: int = 4096):
        """回傳 (image_scores[N], patch_maps[N, fmap, fmap])"""
        assert self.model is not None
        mem = self.model.memory
        img_scores, maps = [], []
        for i in range(0, len(tensors), batch):
            f = self._feats(torch.stack(tensors[i:i + batch]))
            B, C, H, W = f.shape
            q = f.permute(0, 2, 3, 1).reshape(-1, C)
            d = torch.empty(q.shape[0], device=self.device)
            for j in range(0, q.shape[0], chunk):
                d[j:j + chunk] = torch.cdist(q[j:j + chunk], mem).min(dim=1).values
            d = d.reshape(B, H, W)
            maps.append(d.cpu())
            img_scores.append(d.reshape(B, -1).max(dim=1).values.cpu())
        return torch.cat(img_scores).numpy(), torch.cat(maps).numpy()

    def anomaly_map(self, patch_map: np.ndarray, out_size: tuple[int, int], sigma: float = 4.0) -> np.ndarray:
        m = cv2.resize(patch_map.astype(np.float32), (out_size[1], out_size[0]), interpolation=cv2.INTER_LINEAR)
        return cv2.GaussianBlur(m, (0, 0), sigma)


def calibrate_thresholds(good_img_scores: np.ndarray, good_maps: np.ndarray, k_sigma: float = 3.0, pixel_q: float = 0.999) -> dict:
    """
    用「留出的 OK 件」定門檻:
      影像門檻 = OK 分數 平均 + kσ(也回報 max,兩者取大以免誤殺)
      像素門檻 = OK 件所有像素分數的 99.9 百分位
    """
    mu, sd = float(good_img_scores.mean()), float(good_img_scores.std())
    img_thr = max(mu + k_sigma * sd, float(good_img_scores.max()) * 1.02)
    pix_thr = float(np.quantile(good_maps, pixel_q))
    return {"image_threshold": img_thr, "pixel_threshold": pix_thr, "good_mean": mu, "good_std": sd,
            "good_max": float(good_img_scores.max()), "k_sigma": k_sigma, "pixel_q": pixel_q, "n_good": int(len(good_img_scores))}
