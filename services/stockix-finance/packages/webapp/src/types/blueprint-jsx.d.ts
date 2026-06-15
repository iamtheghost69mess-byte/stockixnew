import 'react';

declare module 'react' {
  interface ComponentClass<P = {}, S = ComponentState> {
    displayName?: string;
  }

  // Formik 2.2.5 Form.d.ts was compiled against older React types that included these keys
  // in FormHTMLAttributes and DOMEventHandler. The keys are absent in @types/react@18.x,
  // so Formik's hardcoded Pick resolves them as required `never`. Declaring them optional
  // here restores compatibility without touching node_modules.
  interface HTMLAttributes<T> {
    onPointerEnterCapture?: PointerEventHandler<T>;
    onPointerLeaveCapture?: PointerEventHandler<T>;
  }

  interface FormHTMLAttributes<T> {
    placeholder?: string;
  }
}

export {};