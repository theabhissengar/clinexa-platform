"use client";

import { useParams } from "next/navigation";

import { ProductEditorPage } from "./product-editor-page";

/** Clicking a product opens the full editor (create/edit parity). */
export function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  return <ProductEditorPage mode="edit" productId={params.id} />;
}
