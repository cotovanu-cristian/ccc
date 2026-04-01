export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface BaseField {
  name: string;
  label: string;
  required?: boolean;
}

export interface TextField extends BaseField {
  type: "text";
  placeholder?: string;
  defaultValue?: string;
}

export interface PasswordField extends BaseField {
  type: "password";
  placeholder?: string;
}

export interface SelectField extends BaseField {
  type: "select";
  options: SelectOption[];
  initialValue?: string;
}

export interface MultiSelectField extends BaseField {
  type: "multiselect";
  options: SelectOption[];
  initialValues?: string[];
}

export interface ToggleField extends BaseField {
  type: "toggle";
  defaultValue?: boolean;
}

export type FormField = MultiSelectField | PasswordField | SelectField | TextField | ToggleField;

export interface PopupFormDefinition {
  title: string;
  fields: FormField[];
  width?: string;
  height?: string;
}

export type FormResultData = Record<string, string[] | boolean | string>;

export interface PopupSuccess<T = FormResultData> {
  status: "ok";
  data: T;
}

export interface PopupCancelled {
  status: "cancelled";
}

export interface PopupError {
  status: "error";
  error: string;
}

export type PopupResult<T = FormResultData> = PopupCancelled | PopupError | PopupSuccess<T>;

export interface PopupOptions {
  timeout?: number;
  targetPane?: string;
}

export interface TextFieldState {
  type: "text";
  name: string;
  label: string;
  value: string;
  placeholder: string;
  cursorPos: number;
  required: boolean;
  masked: boolean;
}

export interface SelectFieldState {
  type: "select";
  name: string;
  label: string;
  options: SelectOption[];
  selectedIndex: number;
  required: boolean;
}

export interface MultiSelectFieldState {
  type: "multiselect";
  name: string;
  label: string;
  options: SelectOption[];
  selectedIndices: Set<number>;
  focusedIndex: number;
  required: boolean;
}

export interface ToggleFieldState {
  type: "toggle";
  name: string;
  label: string;
  value: boolean;
  required: boolean;
}

export type FieldState = MultiSelectFieldState | SelectFieldState | TextFieldState | ToggleFieldState;
