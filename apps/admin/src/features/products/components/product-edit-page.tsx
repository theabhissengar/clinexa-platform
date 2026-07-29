"use client";

import { useParams } from "next/navigation";

import { ProductEditorPage } from "./product-editor-page";

export function ProductEditPage() {
  const params = useParams<{ id: string }>();
  return <ProductEditorPage mode="edit" productId={params.id} />;
}
