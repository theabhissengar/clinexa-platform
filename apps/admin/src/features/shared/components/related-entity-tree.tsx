"use client";

import Link from "next/link";

type EntityRef = {
  id: string;
  label: string;
};

type Props = {
  context: "crm" | "guardian";
  user?: EntityRef;
  parentOrder?: EntityRef;
  subscription?: EntityRef;
  renewals?: EntityRef[];
};

function entityHref(
  context: "crm" | "guardian",
  kind: "users" | "orders" | "subscriptions",
  id: string,
): string {
  return `/${context}/${kind}/${id}`;
}

function TreeNode({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative pl-4">
      <span
        className="absolute left-0 top-3 h-full w-px bg-border"
        aria-hidden
      />
      <span
        className="absolute left-0 top-3 h-px w-3 bg-border"
        aria-hidden
      />
      <div className="py-1">
        {href ? (
          <Link
            href={href}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <span className="text-sm font-medium">{title}</span>
        )}
      </div>
      {children ? <ul className="ml-2">{children}</ul> : null}
    </li>
  );
}

export function RelatedEntityTree({
  context,
  user,
  parentOrder,
  subscription,
  renewals = [],
}: Props) {
  if (!user && !parentOrder && !subscription && renewals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No related entities.</p>
    );
  }

  return (
    <ul className="space-y-0">
      {user ? (
        <TreeNode
          title={`User · ${user.label}`}
          href={entityHref(context, "users", user.id)}
        >
          {parentOrder ? (
            <TreeNode
              title={`Parent order · ${parentOrder.label}`}
              href={entityHref(context, "orders", parentOrder.id)}
            >
              {subscription ? (
                <TreeNode
                  title={`Subscription · ${subscription.label}`}
                  href={entityHref(context, "subscriptions", subscription.id)}
                >
                  {renewals.map((renewal) => (
                    <TreeNode
                      key={renewal.id}
                      title={`Renewal · ${renewal.label}`}
                      href={entityHref(context, "orders", renewal.id)}
                    />
                  ))}
                </TreeNode>
              ) : null}
            </TreeNode>
          ) : subscription ? (
            <TreeNode
              title={`Subscription · ${subscription.label}`}
              href={entityHref(context, "subscriptions", subscription.id)}
            >
              {renewals.map((renewal) => (
                <TreeNode
                  key={renewal.id}
                  title={`Renewal · ${renewal.label}`}
                  href={entityHref(context, "orders", renewal.id)}
                />
              ))}
            </TreeNode>
          ) : null}
        </TreeNode>
      ) : null}
    </ul>
  );
}
