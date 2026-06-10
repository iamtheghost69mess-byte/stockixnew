declare module 'is-my-json-valid' {
  interface ValidateOptions {
    required?: string[];
    type?: string;
    properties?: Record<string, { type?: string | string[] }>;
  }

  type Validator = (data: unknown) => boolean;

  export default function validator(schema: ValidateOptions): Validator;
}
