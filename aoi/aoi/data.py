from __future__ import annotations
import glob, os
from dataclasses import dataclass
import numpy as np
import cv2
import torch

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff")


def list_images(path: str) -> list[str]:
    if os.path.isfile(path):
        return [path]
    files = []
    for e in EXTS:
        files += glob.glob(os.path.join(path, "**", f"*{e}"), recursive=True)
        files += glob.glob(os.path.join(path, "**", f"*{e.upper()}"), recursive=True)
    return sorted(set(files))


def load_rgb(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(path)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


@dataclass
class Preproc:
    size: int = 256
    polar: bool = False  # 圓形零件:攤平成極座標帶狀圖(旋轉不變)

    def __call__(self, rgb: np.ndarray) -> np.ndarray:
        if self.polar:
            rgb = to_polar(rgb, self.size)
        else:
            rgb = cv2.resize(rgb, (self.size, self.size), interpolation=cv2.INTER_AREA)
        return rgb

    def to_tensor(self, rgb: np.ndarray) -> torch.Tensor:
        x = (rgb.astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
        return torch.from_numpy(x).permute(2, 0, 1)


def find_circle(rgb: np.ndarray) -> tuple[int, int, int]:
    """找零件外圓(圓心 x, y, 半徑)。找不到就用影像中心與短邊一半。"""
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.medianBlur(g, 5)
    h, w = g.shape
    minr, maxr = int(min(h, w) * 0.25), int(min(h, w) * 0.5)
    c = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT, dp=1.2, minDist=min(h, w), param1=120, param2=40, minRadius=minr, maxRadius=maxr)
    if c is None:
        return w // 2, h // 2, min(h, w) // 2
    x, y, r = c[0][0]
    return int(x), int(y), int(r)


def to_polar(rgb: np.ndarray, size: int) -> np.ndarray:
    """以外圓為準做極座標展開:橫軸 = 角度 0~360°,縱軸 = 半徑(外圓在下)。"""
    x, y, r = find_circle(rgb)
    out = cv2.warpPolar(rgb, (size, size), (x, y), r, cv2.WARP_POLAR_LINEAR | cv2.INTER_LINEAR)
    # warpPolar 輸出:列 = 角度,欄 = 半徑;轉成欄 = 角度
    return cv2.rotate(out, cv2.ROTATE_90_COUNTERCLOCKWISE)
