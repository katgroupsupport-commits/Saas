import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Page, Section } from "../../components";
import { repository } from "../../services/repository";
import { audit, makeId } from "../../services/storage";

const subscriptionPlans = [
  {
    id: "free",
    name: "Free",
    duration: "Free",
    amount: 0,
    maxGroups: 1,
    maxMembers: 5,
    features: ["1 group", "5 members", "Basic savings and loan tracking", "Member app access"]
  },
  {
    id: "starter-monthly",
    name: "Starter",
    duration: "Monthly",
    amount: 99,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["1 group", "Unlimited members", "Approvals", "Audit control", "Role control", "Free member app access", "Contact support to setup your group", "Technical issue support"]
  },
  {
    id: "starter-yearly",
    name: "Starter",
    duration: "Yearly",
    amount: 999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["1 group", "Unlimited members", "Approvals", "Audit control", "Role control", "Free member app access", "Contact support to setup your group", "Technical issue support"]
  },
  {
    id: "growth-monthly",
    name: "Growth",
    duration: "Monthly",
    amount: 299,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Starter", "Group management query support", "Assisted transaction entry support", "Daily/monthly adjustment support"]
  },
  {
    id: "growth-yearly",
    name: "Growth",
    duration: "Yearly",
    amount: 2999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Starter", "Group management query support", "Assisted transaction entry support", "Daily/monthly adjustment support"]
  },
  {
    id: "premium-monthly",
    name: "Premium",
    duration: "Monthly",
    amount: 999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Growth", "Priority support", "Advanced reconciliation support", "Dedicated setup guidance"]
  },
  {
    id: "premium-yearly",
    name: "Premium",
    duration: "Yearly",
    amount: 9999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Growth", "Priority support", "Advanced reconciliation support", "Dedicated setup guidance"]
  }
];

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function loadRazorpayCheckout() {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay checkout is available only in the browser."));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay checkout.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout."));
    document.body.appendChild(script);
  });
}

function getCurrencyFormatter() {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });
}

function serializeError(err) {
  try {
    if (!err) return "";
    if (typeof err === "string") return err;
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } catch (e) {
    return String(err);
  }
}

function getActiveGroupSubscription(state, groupId) {
  return (state.subscriptions || []).find((subscription) =>
    String(subscription.groupId) === String(groupId)
    && ["ACTIVE", "PAID"].includes(String(subscription.status || subscription.paymentStatus || "").toUpperCase())
  );
}

function getGroupPlan(state, groupId) {
  const subscription = getActiveGroupSubscription(state, groupId);
  return subscriptionPlans.find((plan) => plan.name === subscription?.plan && plan.duration === subscription?.duration)
    ?? subscriptionPlans.find((plan) => plan.id === "free");
}

export default function SubscriptionsPage({ state, setState, actor, selectedGroup, setConfirmDialog, setNotification }) {
  const currency = getCurrencyFormatter();
  const currentSubscription = (state.subscriptions || []).find((subscription) => !subscription.groupId || String(subscription.groupId) === String(selectedGroup?.id));
  const activePlan = getGroupPlan(state, selectedGroup?.id);
  const [paymentPlanId, setPaymentPlanId] = useState("");

  function subscribe(plan) {
    if (plan.id === "free") {
      setNotification({ type: "info", message: "Free plan is active by default for 1 group and 5 members." });
      return;
    }
    if (!selectedGroup?.id) {
      setNotification({ type: "error", message: "Create/select a group before buying a plan." });
      return;
    }
    if (!repository.isConfigured()) {
      setNotification({ type: "error", message: "Cloud sync must be enabled before payments can be used." });
      return;
    }
    if (!import.meta.env.VITE_RAZORPAY_KEY_ID) {
      setNotification({ type: "error", message: "Add VITE_RAZORPAY_KEY_ID in .env.local before taking payments." });
      return;
    }
    setConfirmDialog({
      title: `Subscribe to ${plan.name}`,
      message: `Proceed with ${plan.duration.toLowerCase()} payment of ${currency.format(plan.amount)} per group using Razorpay?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setPaymentPlanId(plan.id);
        try {
          await loadRazorpayCheckout();
          const orderResult = await repository.createRazorpayOrder({
            groupId: selectedGroup.id,
            planName: plan.name,
            duration: plan.duration
          });
          const order = orderResult.order;
          if (!order?.id) throw new Error("Razorpay order was not created.");

          const checkoutResult = await new Promise((resolve, reject) => {
            const razorpay = new window.Razorpay({
              key: import.meta.env.VITE_RAZORPAY_KEY_ID,
              amount: order.amount,
              currency: order.currency ?? "INR",
              name: "Bachat Gat SaaS",
              description: `${plan.name} ${plan.duration} plan`,
              order_id: order.id,
              prefill: {
                name: actor?.name ?? "",
                email: actor?.email ?? "",
                contact: actor?.mobile ?? ""
              },
              notes: {
                group_id: String(selectedGroup.id),
                plan_name: plan.name,
                duration: plan.duration
              },
              theme: { color: "#0f766e" },
              handler: resolve,
              modal: {
                ondismiss: () => reject(new Error("Payment cancelled."))
              }
            });
            razorpay.on("payment.failed", (response) => {
              const description = response?.error?.description || response?.error?.reason || "Payment failed.";
              reject(new Error(description));
            });
            razorpay.open();
          });

          const verification = await repository.verifyRazorpayPayment({
            groupId: selectedGroup.id,
            planName: plan.name,
            duration: plan.duration,
            ...checkoutResult
          });
          const verifiedPlan = verification.plan ?? plan;
          const verifiedSubscription = verification.subscription ?? {};
          const subscription = {
            id: verifiedSubscription.group_subscription_id ?? makeId("sub"),
            groupId: selectedGroup.id,
            groupName: selectedGroup.name ?? state.groups[0]?.name ?? "Current group",
            plan: verifiedPlan.name ?? plan.name,
            duration: verifiedPlan.duration ?? plan.duration,
            status: "Active",
            amount: Number(verifiedPlan.amount ?? plan.amount),
            startDate: verifiedSubscription.start_date,
            endDate: verifiedSubscription.end_date,
            renewalDate: verifiedSubscription.end_date ?? addMonths(new Date(), plan.duration === "Yearly" ? 12 : 1).toISOString().slice(0, 10),
            paymentStatus: "Paid",
            paymentProvider: "Razorpay",
            transactionReference: verifiedSubscription.transaction_reference ?? checkoutResult.razorpay_payment_id,
            maxMembers: Number(verifiedPlan.maxMembers ?? plan.maxMembers),
            features: verifiedPlan.features ?? plan.features
          };

          setState((current) => audit({
            state: {
              ...current,
              subscriptions: [
                subscription,
                ...(current.subscriptions || []).filter((item) => String(item.groupId) !== String(selectedGroup.id))
              ]
            },
            actor,
            action: "subscribe",
            tableName: "group_subscriptions",
            recordId: subscription.id,
            newValue: subscription
          }));
          setNotification({ type: "success", message: `${subscription.plan} ${subscription.duration} subscription activated. Razorpay payment ${checkoutResult.razorpay_payment_id} verified.` });
          setTimeout(() => setNotification(null), 6000);
        } catch (error) {
          setNotification({ type: "error", message: `Unable to complete Razorpay payment: ${error.message}`, details: serializeError(error) });
        } finally {
          setPaymentPlanId("");
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: "info", message: "Subscription payment cancelled." });
        setTimeout(() => setNotification(null), 3000);
      }
    });
  }

  return (
    <Page title="Subscriptions" subtitle="Choose a plan and complete one-time Razorpay payment" action={null}>
      {!currentSubscription && (
        <Section title="Current plan">
          <div className="status-row">
            <CheckCircle2 className="success" size={22} />
            <div>
              <strong>{activePlan.name} plan active</strong>
              <span>1 group / {activePlan.maxMembers} members. Subscribe when you need more members or assisted support.</span>
            </div>
          </div>
        </Section>
      )}
      {currentSubscription && (
        <Section title="Current subscription">
          <div className="status-row">
            <CheckCircle2 className="success" size={22} />
            <div>
              <strong>{currentSubscription.plan} {currentSubscription.duration ?? ""} plan active</strong>
              <span>Renewal {currentSubscription.renewalDate} / {currentSubscription.paymentProvider ?? "Manual"} / {currentSubscription.transactionReference ?? "No reference"}</span>
            </div>
          </div>
        </Section>
      )}
      <div className="data-grid">
        {subscriptionPlans.map((plan) => (
          <article className="entity-card" key={plan.id}>
            <span className="pill success-pill">{plan.duration}</span>
            <h3>{plan.name}</h3>
            <p>{plan.maxGroups} group / {Number.isFinite(plan.maxMembers) ? `${plan.maxMembers} members` : "Unlimited members"}</p>
            <strong>{currency.format(plan.amount)}</strong>
            <div className="tag-list">
              {plan.features.map((feature) => <span key={feature}>{feature}</span>)}
            </div>
            <button type="button" className="primary-button" onClick={() => subscribe(plan)} disabled={Boolean(paymentPlanId)}>
              {paymentPlanId === plan.id ? "Opening Razorpay..." : plan.amount === 0 ? "Current Free Plan" : "Pay & Subscribe"}
            </button>
          </article>
        ))}
      </div>
    </Page>
  );
}
