import * as React from "react";
import { useForm } from "react-hook-form";
import { 
  Form, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormMessage,
  Input,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Checkbox
} from "@repo/ui-core";
import { FormDefinition } from "./schema";

export interface MetaFormProps {
  schema: FormDefinition;
  onSubmit: (data: any) => void;
  defaultValues?: any;
}

export function MetaForm({ schema, onSubmit, defaultValues }: MetaFormProps) {
  const form = useForm({
    defaultValues: defaultValues || {}
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {schema.title && <h2 className="text-xl font-semibold">{schema.title}</h2>}
        
        <div className="space-y-4">
          {schema.fields.map((field) => (
            <FormField
              key={field.name}
              control={form.control}
              name={field.name}
              rules={{ required: field.required }}
              render={({ field: formField }) => (
                <FormItem className={field.type === "checkbox" ? "flex flex-row items-start space-x-3 space-y-0" : ""}>
                  <FormLabel>{field.label}</FormLabel>
                  <FormControl>
                    {field.CustomComponent ? (
                      <field.CustomComponent {...formField} />
                    ) : field.type === "text" || field.type === "number" || field.type === "date" ? (
                      <Input type={field.type} {...formField} />
                    ) : field.type === "select" ? (
                      <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "checkbox" ? (
                      <Checkbox 
                        checked={formField.value} 
                        onCheckedChange={formField.onChange} 
                      />
                    ) : <></>}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
        
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
