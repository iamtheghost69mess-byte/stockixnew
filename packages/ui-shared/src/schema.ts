import { z } from "zod";

export const fieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "date", "select", "checkbox"]),
  required: z.boolean().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string()
  })).optional(),
  CustomComponent: z.any().optional(),
});

export const formSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  fields: z.array(fieldSchema),
});

export type FieldDefinition = z.infer<typeof fieldSchema>;
export type FormDefinition = z.infer<typeof formSchema>;
