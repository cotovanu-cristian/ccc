import { z } from "zod";
import type { FormField } from "./types";

interface JsonSchemaProperty {
  type?: string;
  enum?: string[];
  const?: unknown;
  description?: string;
  default?: unknown;
  anyOf?: JsonSchemaProperty[];
  oneOf?: JsonSchemaProperty[];
}

interface JsonSchemaObject {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

const isJsonSchemaObject = (schema: unknown): schema is JsonSchemaObject => {
  return (
    typeof schema === "object" && schema !== null && (schema as Record<string, unknown>).type === "object"
  );
};

const propertyToField = (name: string, prop: JsonSchemaProperty, required: boolean): FormField | null => {
  const label = prop.description ?? name;

  // handle anyOf/oneOf (nullable wrappers, unions)
  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    const nonNull = variants.filter((v) => v.type !== "null");
    // nullable wrapper: unwrap to the inner type
    if (nonNull.length === 1 && nonNull[0]) {
      return propertyToField(
        name,
        { ...nonNull[0], description: prop.description ?? nonNull[0].description, default: prop.default },
        false,
      );
    }
    // union of string literals → select
    const allStringConst =
      nonNull.length > 0 && nonNull.every((v) => v.type === "string" && v.const !== undefined);
    if (allStringConst) {
      return {
        type: "select",
        name,
        label,
        options: nonNull.map((v) => ({ value: String(v.const), label: String(v.const) })),
        initialValue: typeof prop.default === "string" ? prop.default : undefined,
        required,
      };
    }
    // complex union — fall back to text
    return { type: "text", name, label, required };
  }

  // handle const (literal)
  if (prop.const !== undefined) {
    return {
      type: "text",
      name,
      label,
      defaultValue: String(prop.const),
      required,
    };
  }

  // boolean → toggle
  if (prop.type === "boolean") {
    return {
      type: "toggle",
      name,
      label,
      defaultValue: typeof prop.default === "boolean" ? prop.default : undefined,
      required,
    };
  }

  // string with enum → select
  if (prop.type === "string" && prop.enum && prop.enum.length > 0) {
    return {
      type: "select",
      name,
      label,
      options: prop.enum.map((v) => ({ value: v, label: v })),
      initialValue: typeof prop.default === "string" ? prop.default : undefined,
      required,
    };
  }

  // string → text
  if (prop.type === "string") {
    return {
      type: "text",
      name,
      label,
      defaultValue: typeof prop.default === "string" ? prop.default : undefined,
      required,
    };
  }

  // number/integer → text with numeric hint
  if (prop.type === "number" || prop.type === "integer") {
    return {
      type: "text",
      name,
      label: `${label} (number)`,
      defaultValue: prop.default !== undefined ? String(prop.default) : undefined,
      required,
    };
  }

  // unsupported type — fall back to text
  return {
    type: "text",
    name,
    label,
    required,
  };
};

export const formFieldsFromSchema = (schema: z.ZodType): FormField[] => {
  const jsonSchema = z.toJSONSchema(schema);

  // single (non-object) schema → one field named "value"
  if (!isJsonSchemaObject(jsonSchema)) {
    const prop = jsonSchema as JsonSchemaProperty;
    const field = propertyToField("value", prop, true);
    return field ? [field] : [];
  }

  const properties = jsonSchema.properties ?? {};
  const required = new Set(jsonSchema.required ?? []);
  const fields: FormField[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    const field = propertyToField(name, prop, required.has(name));
    if (field) fields.push(field);
  }

  return fields;
};

// resolve the effective type from a property, unwrapping nullable/optional anyOf wrappers
const resolvePropertyType = (prop: JsonSchemaProperty) => {
  if (prop.type) return prop.type;
  const variants = prop.anyOf ?? prop.oneOf;
  if (!variants) return undefined;
  const nonNull = variants.filter((v) => v.type !== "null");
  if (nonNull.length === 1 && nonNull[0]) return nonNull[0].type;
  return undefined;
};

// coerce raw string form data back to types expected by Zod
export const coerceFormData = (
  data: Record<string, string[] | boolean | string>,
  schema: z.ZodType,
): Record<string, unknown> => {
  const jsonSchema = z.toJSONSchema(schema);
  if (!isJsonSchemaObject(jsonSchema)) return data;

  const properties = jsonSchema.properties ?? {};
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const prop = properties[key];
    if (!prop) {
      result[key] = value;
      continue;
    }

    const resolvedType = resolvePropertyType(prop);

    // coerce string → number for numeric fields
    if ((resolvedType === "number" || resolvedType === "integer") && typeof value === "string") {
      const num = Number(value);
      result[key] = Number.isNaN(num) ? value : num;
      continue;
    }

    // coerce string → boolean for boolean fields
    if (resolvedType === "boolean" && typeof value === "string") {
      result[key] = value === "true" || value === "yes" || value === "1";
      continue;
    }

    result[key] = value;
  }

  return result;
};
