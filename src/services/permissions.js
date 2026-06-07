export const roles = {
  SUPER_ADMIN: "Super Admin",
  PRODUCT_OWNER: "Product Owner",
  GROUP_ADMIN: "Group Admin",
  COLLECTOR: "Collector",
  APPROVER: "Approver",
  MEMBER: "Member"
};

const permissions = {
  [roles.SUPER_ADMIN]: [
    "platform:read",
    "groups:manage",
    "subscriptions:manage",
    "members:manage",
    "periods:manage",
    "transactions:create",
    "withdrawals:create",
    "approvals:manage",
    "adjustments:manage",
    "reversals:manage",
    "audit:read",
    "shares:read",
    "reports:read",
    "settings:manage",
    "setup:manage"
  ],
  [roles.PRODUCT_OWNER]: [
    "platform:read",
    "groups:manage",
    "subscriptions:manage",
    "members:manage",
    "periods:manage",
    "transactions:create",
    "withdrawals:create",
    "approvals:manage",
    "adjustments:manage",
    "reports:read",
    "settings:manage",
    "setup:manage",
    "support:manage"
  ],
  [roles.GROUP_ADMIN]: [
    "platform:read",
    "groups:manage",
    "subscriptions:read",
    "members:manage",
    "periods:manage",
    "transactions:create",
    "withdrawals:create",
    "approvals:manage",
    "adjustments:manage",
    "reversals:manage",
    "audit:read",
    "shares:read",
    "reports:read",
    "settings:manage",
    "setup:manage"
  ],
  [roles.COLLECTOR]: [
    "platform:read",
    "members:read",
    "transactions:create",
    "withdrawals:create",
    "loans:create",
    "approvals:read"
  ],
  [roles.APPROVER]: ["platform:read", "approvals:manage", "reports:read", "members:read"],
  [roles.MEMBER]: ["self:read", "notifications:read", "loans:create", "withdrawals:create"]
};

export function can(role, permission) {
  const effectiveRole = normalizeRole(role);
  return permissions[effectiveRole]?.includes(permission) ?? false;
}

export function normalizeRole(role) {
  return Object.values(roles).includes(role) ? role : roles.MEMBER;
}

export function visibleMenu(role) {
  const menu = [
    { path: "/", label: "Group Dashboard", permission: "platform:read" },
    { path: "/members", label: "Members", permission: "members:read", fallback: "members:manage" },
    { path: "/transactions", label: "Transactions", permission: "transactions:create" },
    { path: "/withdrawals", label: "Withdrawals", permission: "withdrawals:create", fallback: "transactions:create" },
    { path: "/pending-dues", label: "Pending Dues", permission: "platform:read" },
    { path: "/loans", label: "Loans", permission: "loans:create", fallback: "transactions:create" },
    { path: "/corrections", label: "Corrections", permission: "adjustments:manage", fallback: "transactions:create" },
    { path: "/approvals", label: "Approvals", permission: "approvals:read", fallback: "approvals:manage" },
    { path: "/reports", label: "Reports & Audit", permission: "reports:read" },
    { path: "/setup", label: "Setup", permission: "setup:manage", fallback: "settings:manage" },
    { path: "/contact-support", label: "Contact", permission: "platform:read" },
    { path: "/product-owner", label: "Product Owner", permission: "support:manage" },
    { path: "/subscriptions", label: "Subscriptions", permission: "subscriptions:read", fallback: "subscriptions:manage" }
  ];

  if (role === roles.MEMBER) {
    return [
      { path: "/", label: "My Dashboard" },
      { path: "/my-savings", label: "My Savings" },
      { path: "/loans", label: "Request Loan" },
      { path: "/withdrawals", label: "Request Withdrawal" },
      { path: "/pending-dues", label: "Pending Dues" },
      { path: "/my-loans", label: "My Loans" },
      { path: "/notifications", label: "Notifications" },
      { path: "/approvals", label: "Approvals" },
      { path: "/reports", label: "Reports & Audit" },
      { path: "/contact-support", label: "Contact" }
    ];
  }

  return menu.filter((item) => can(role, item.permission) || can(role, item.fallback));
}
