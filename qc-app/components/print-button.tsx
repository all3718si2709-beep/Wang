"use client";
import { Button } from "./ui";
import { Printer } from "lucide-react";
export function PrintButton() {
  return <Button onClick={() => window.print()}><Printer className="h-4 w-4" />列印 / 存 PDF</Button>;
}
