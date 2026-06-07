import { z } from "zod";

const idValue = z.preprocess((value) => value == null ? "" : String(value), z.string().min(1, "Select a value"));
const requiredNonNegativeNumber = (message) => z.preprocess(
  (value) => value === "" || value == null ? undefined : value,
  z.coerce.number({ invalid_type_error: message, required_error: message }).nonnegative(message)
);
export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  mobile: z.preprocess(
    (value) => typeof value === "string" ? value.replace(/\D/g, "") : value,
    z.union([z.literal(""), z.string().regex(/^\d{10}$/, "Enter a valid 10 digit mobile number")])
  ).optional()
});

export const otpPasswordSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required"),
    email: z.string().email("Enter a valid email"),
    mobile: z.preprocess(
      (value) => typeof value === "string" ? value.replace(/\D/g, "") : value,
      z.union([z.literal(""), z.string().regex(/^\d{10}$/, "Enter a valid 10 digit mobile number")])
    ).optional(),
    otpCode: z.string().min(4, "Enter the OTP sent to your email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm password is required")
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match"
  });

export const passwordResetSchema = z.object({
  email: z.string().email("Enter a valid email")
});

export const memberSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").regex(/^[A-Za-z .'-]+$/, "Full name must contain only letters, spaces, dots, apostrophes, or hyphens"),
  email: z.preprocess(
    (value) => String(value ?? "").trim(),
    z.union([z.literal(""), z.string().email("Enter a valid email")])
  ).optional(),
  mobile: z.preprocess(
    (value) => typeof value === "string" ? value.replace(/\D/g, "") : value,
    z.union([z.literal(""), z.string().regex(/^\d{10}$/, "Enter a valid 10 digit mobile number")])
  ).optional(),
  username: z.string().trim().min(4, "Username is required").regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, hyphen, or underscore"),
  address: z.string().optional(),
  dateJoined: z.string().optional(),
  nominee: z.string().optional(),
  aadhaar: z.string().optional(),
  pan: z.string().optional()
});

export const groupSchema = z.object({
  name: z.string().min(3, "Group name is required"),
  primaryContact: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  collector: z.string().optional(),
  firstApprover: z.string().optional(),
  secondApprover: z.string().optional(),
  plan: z.string().optional(),
  financialYear: z.string().optional(),
  startMonth: z.coerce.number().optional(),
  maxLoanMultiplier: z.coerce.number().positive("Loan multiplier must be a positive number").optional(),
  maximumLoanLimit: z.coerce.number().positive("Maximum loan limit must be a positive number").optional(),
  monthlySaving: z.coerce.number().positive("Monthly saving must be a positive number").optional(),
  loanInterestStartMode: z.enum(["disbursement", "fullMonth"]).optional()
});

export const transactionSchema = z.object({
  memberId: idValue,
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  transactionDate: z.string().min(1, "Transaction date is required"),
  transactionType: z.string().min(1, "Transaction type is required")
});

export const legacyMigrationSchema = z.object({
  memberId: idValue,
  joinedDate: z.string().min(1, "Joined date is required"),
  exitDate: z.string().optional(),
  totalSaving: requiredNonNegativeNumber("Total saving is required"),
  pendingLoan: requiredNonNegativeNumber("Pending loan is required"),
  interestAmount: requiredNonNegativeNumber("Pending interest amount is required"),
  penaltyAmount: requiredNonNegativeNumber("Pending penalty amount is required")
});

export const loanSchema = z.object({
  memberId: idValue,
  amount: z.coerce.number().positive("Loan amount is required"),
  reason: z.string().optional(),
  rate: z.coerce.number().min(0).optional(),
  durationMonths: z.coerce.number().int().min(0).optional(),
  startDate: z.string().min(1, "Start date is required")
});

export function validate(schema, values) {
  const result = schema.safeParse(values);
  if (result.success) {
    return { data: result.data, errors: {} };
  }

  return {
    data: null,
    errors: Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
  };
}
