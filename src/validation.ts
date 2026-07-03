import { z } from "zod";

export const CurrencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code like GBP or USD")
  .toUpperCase();

export const AmountSchema = z
  .number()
  .finite("Amount must be a finite number")
  .positive("Amount must be greater than 0");
