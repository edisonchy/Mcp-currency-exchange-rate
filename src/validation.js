import { z } from "zod";

export const CurrencyCodeSchema = z
  .string()
  .min(3)
  .max(3)
  .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code like GBP or USD");

export const AmountSchema = z
  .number()
  .positive("Amount must be greater than 0");
