"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequirePermission } from "@/components/auth/require-permission";
import { Permissions } from "@/features/auth/permissions";
import {
  createCategory,
  deleteCategory,
  getAdminCategory,
  listAdminCategories,
  publishCategory,
  unpublishCategory,
  updateCategory,
} from "@/features/categories/api/categories-api";
import type { Category } from "@/features/categories/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const DISPLAY_TYPES = ["Default", "Products", "Subcategories", "Both"];
const ALIGN_OPTIONS = ["Default", "Left", "Center", "Right"];

const CONTENT_ROLES = [
  "Administrator",
  "Affiliate",
  "Author",
  "Clinical Assistant",
  "Contributor",
  "Customer",
  "Doctor",
];

type Props = {
  mode: "create" | "edit";
};

type PermissionTab = "roles" | "memberships" | "error";

export function CategoryEditorPage({ mode }: Props) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const categoryId = mode === "edit" ? params.id : undefined;

  const [parents, setParents] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [permissionTab, setPermissionTab] = useState<PermissionTab>("roles");
  const [status, setStatus] = useState<string>("DRAFT");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [thumbnailMediaAssetId, setThumbnailMediaAssetId] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [maxQuantity, setMaxQuantity] = useState("");
  const [groupOf, setGroupOf] = useState("");
  const [displayType, setDisplayType] = useState("Default");
  const [headerContentAlign, setHeaderContentAlign] = useState("Default");
  const [headerTextAlign, setHeaderTextAlign] = useState("Default");
  const [headerImageAssetId, setHeaderImageAssetId] = useState("");
  const [contentRoles, setContentRoles] = useState<string[]>([]);

  useEffect(() => {
    void listAdminCategories()
      .then((r) =>
        setParents(
          r.items.filter((c) => (categoryId ? c.id !== categoryId : true)),
        ),
      )
      .catch(() => undefined);
  }, [categoryId]);

  useEffect(() => {
    if (mode !== "edit" || !categoryId) return;
    void getAdminCategory(categoryId)
      .then((c) => {
        setName(c.name);
        setSlug(c.slug);
        setDescription(c.description ?? "");
        setParentId(c.parentId ?? "");
        setSeoTitle(c.seoTitle ?? "");
        setSeoDescription(c.seoDescription ?? "");
        setSortOrder(String(c.sortOrder ?? 0));
        setThumbnailMediaAssetId(c.thumbnailMediaAssetId ?? "");
        setMinQuantity(c.minQuantity != null ? String(c.minQuantity) : "");
        setMaxQuantity(c.maxQuantity != null ? String(c.maxQuantity) : "");
        setGroupOf(c.groupOf != null ? String(c.groupOf) : "");
        setDisplayType(c.displayType || "Default");
        setHeaderContentAlign(c.headerContentAlign || "Default");
        setHeaderTextAlign(c.headerTextAlign || "Default");
        setHeaderImageAssetId(c.headerImageAssetId ?? "");
        setContentRoles(c.contentPermissionRoles ?? []);
        setStatus(c.lifecycleStatus);
      })
      .catch(() => setError("Unable to load category."));
  }, [mode, categoryId]);

  function buildPayload() {
    return {
      name,
      slug: slug || slugify(name),
      description: description || undefined,
      parentId: parentId || null,
      seoTitle: seoTitle || name,
      seoDescription: seoDescription || undefined,
      sortOrder: Number(sortOrder) || 0,
      thumbnailMediaAssetId: thumbnailMediaAssetId || null,
      minQuantity: minQuantity ? Number(minQuantity) : null,
      maxQuantity: maxQuantity ? Number(maxQuantity) : null,
      groupOf: groupOf ? Number(groupOf) : null,
      displayType: displayType === "Default" ? null : displayType,
      headerContentAlign:
        headerContentAlign === "Default" ? null : headerContentAlign,
      headerTextAlign: headerTextAlign === "Default" ? null : headerTextAlign,
      headerImageAssetId: headerImageAssetId || null,
      contentPermissionRoles: contentRoles,
    };
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = buildPayload();
      if (mode === "create") {
        const created = await createCategory(payload);
        router.push(`/guardian/categories/${created.id}/edit`);
        return;
      }
      if (!categoryId) return;
      await updateCategory(categoryId, payload);
      setMessage("Category updated.");
    } catch {
      setError("Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(role: string) {
    setContentRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-8">
      <div>
        <Link
          href="/guardian/categories"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All categories
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {mode === "create" ? "Add category" : name || "Edit category"}
        </h1>
        {mode === "edit" && categoryId ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            ID: {categoryId}
          </p>
        ) : null}
        {mode === "edit" && slug ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Permalink:{" "}
            <span className="text-primary">/product-category/{slug}/</span>
          </p>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-4 lg:grid-cols-[1fr_220px]"
      >
        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <h2 className="text-sm font-medium">
            {mode === "create" ? "Add new category" : "Edit category"}
          </h2>

          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (mode === "create" && !slug) setSlug(slugify(e.target.value));
              }}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="parent">Parent category</Label>
            <select
              id="parent"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">None</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {"— ".repeat(p.depth ?? 0)}
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Assign a parent term to create a hierarchy.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              The description is not prominent by default; however, some themes
              may show it.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="minQuantity">Minimum quantity</Label>
            <Input
              id="minQuantity"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter a minimum required quantity for products in this category.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="maxQuantity">Maximum quantity</Label>
            <Input
              id="maxQuantity"
              value={maxQuantity}
              onChange={(e) => setMaxQuantity(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter a maximum required quantity for products in this category.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="groupOf">Group of</Label>
            <Input
              id="groupOf"
              value={groupOf}
              onChange={(e) => setGroupOf(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter a value to require customers to purchase products from this
              category in multiples.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="displayType">Display type</Label>
            <select
              id="displayType"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={displayType}
              onChange={(e) => setDisplayType(e.target.value)}
            >
              {DISPLAY_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="thumbnail">Thumbnail</Label>
            <Input
              id="thumbnail"
              value={thumbnailMediaAssetId}
              onChange={(e) => setThumbnailMediaAssetId(e.target.value)}
              placeholder="Media asset id or URL"
            />
            <p className="text-xs text-muted-foreground">
              Upload/Add image via Media Library (attach asset ref here).
            </p>
          </div>

          <hr className="border-border" />

          <div className="space-y-1">
            <Label htmlFor="headerContentAlign">
              Category header content align
            </Label>
            <select
              id="headerContentAlign"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={headerContentAlign}
              onChange={(e) => setHeaderContentAlign(e.target.value)}
            >
              {ALIGN_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="headerTextAlign">Category header text align</Label>
            <select
              id="headerTextAlign"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={headerTextAlign}
              onChange={(e) => setHeaderTextAlign(e.target.value)}
            >
              {ALIGN_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="headerImage">Category header image</Label>
            <Input
              id="headerImage"
              value={headerImageAssetId}
              onChange={(e) => setHeaderImageAssetId(e.target.value)}
              placeholder="Header image asset id"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="seoTitle">SEO title</Label>
              <Input
                id="seoTitle"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input
                id="sortOrder"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="seoDescription">SEO description</Label>
            <textarea
              id="seoDescription"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium">
              Content Permissions (Member)
            </div>
            <div className="grid sm:grid-cols-[160px_1fr]">
              <nav className="border-b border-border sm:border-b-0 sm:border-r">
                {(
                  [
                    ["roles", "Roles"],
                    ["memberships", "Paid Memberships"],
                    ["error", "Error Message"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPermissionTab(id)}
                    className={`block w-full px-3 py-2 text-left text-sm ${
                      permissionTab === id
                        ? "bg-muted/50 font-medium"
                        : "text-muted-foreground hover:bg-muted/20"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="p-3 text-sm">
                {permissionTab === "roles" ? (
                  <>
                    <p className="mb-2 text-muted-foreground">
                      Limit access to the content to users of the selected
                      roles.
                    </p>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {CONTENT_ROLES.map((role) => (
                        <label key={role} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={contentRoles.includes(role)}
                            onChange={() => toggleRole(role)}
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      If no roles are selected, everyone can view the content.
                      Authors and users with restrict_content capability can
                      view regardless of role. Store enforcement lands with
                      AuthZ consumers.
                    </p>
                  </>
                ) : null}
                {permissionTab === "memberships" ? (
                  <p className="text-muted-foreground">
                    Paid membership gates are reserved until a Memberships
                    module ships. Role allowlists above are the V1 control.
                  </p>
                ) : null}
                {permissionTab === "error" ? (
                  <p className="text-muted-foreground">
                    Custom denial messaging will be owned by Store/CMS
                    presentation — not stored on the category in V1.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="mb-3 text-sm font-medium">
              {mode === "create" ? "Add category" : "Edit category"}
            </div>
            {mode === "edit" ? (
              <p className="mb-2 text-xs text-muted-foreground">Status: {status}</p>
            ) : null}
            {error ? (
              <p className="mb-2 text-xs text-destructive">{error}</p>
            ) : null}
            {message ? (
              <p className="mb-2 text-xs text-emerald-600">{message}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving
                ? "Saving…"
                : mode === "create"
                  ? "Add new category"
                  : "Update"}
            </Button>
            {mode === "edit" && categoryId ? (
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void publishCategory(categoryId)
                      .then((c) => {
                        setStatus(c.lifecycleStatus);
                        setMessage("Published.");
                      })
                      .catch(() => setError("Publish failed."))
                  }
                >
                  Publish
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void unpublishCategory(categoryId)
                      .then((c) => {
                        setStatus(c.lifecycleStatus);
                        setMessage("Unpublished.");
                      })
                      .catch(() => setError("Unpublish failed."))
                  }
                >
                  Unpublish
                </Button>
                <RequirePermission permission={Permissions.CAT_DELETE}>
                  <button
                    type="button"
                    className="text-left text-sm text-destructive hover:underline"
                    onClick={() =>
                      void deleteCategory(categoryId)
                        .then(() => router.push("/guardian/categories"))
                        .catch(() =>
                          setError(
                            "Delete failed. Unlink products and children first.",
                          ),
                        )
                    }
                  >
                    Delete
                  </button>
                </RequirePermission>
              </div>
            ) : null}
          </div>
        </aside>
      </form>
    </main>
  );
}

export function CategoryCreatePage() {
  return <CategoryEditorPage mode="create" />;
}

export function CategoryDetailPage() {
  return <CategoryEditorPage mode="edit" />;
}
