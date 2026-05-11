import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const FOOD_PREF_OPTIONS = [
  { value: "veg", label: "Vegetarian" },
  { value: "non_veg", label: "Non-Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "jain", label: "Jain" },
];

export const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Sedentary (little or no exercise)" },
  { value: "light", label: "Light (1-3 days/wk)" },
  { value: "moderate", label: "Moderate (3-5 days/wk)" },
  { value: "active", label: "Active (6-7 days/wk)" },
  { value: "very_active", label: "Very active (physical job + training)" },
];

export const BLOOD_GROUP_OPTIONS = [
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown",
].map((v) => ({ value: v, label: v === "unknown" ? "Unknown" : v }));

export const MEDICAL_PROFILE_DEFAULTS = {
  full_name: "",
  age: "",
  date_of_birth: "",
  gender: "",
  phone_number: "",
  address: "",
  height_cm: "",
  weight_kg: "",
  blood_group: "",
  medical_conditions: "",
  current_medications: "",
  allergies: "",
  food_preference: "",
  water_intake_liters: "",
  physical_activity_level: "",
  health_goal: "",
  consultation_date: "",
  remarks: "",
};

/** Convert backend-shaped medical profile to form-friendly strings. */
export function medicalProfileToForm(mp) {
  if (!mp) return { ...MEDICAL_PROFILE_DEFAULTS };
  return Object.keys(MEDICAL_PROFILE_DEFAULTS).reduce((acc, k) => {
    const raw = mp[k];
    acc[k] = raw === null || raw === undefined ? "" : String(raw);
    return acc;
  }, {});
}

/** Convert form to backend payload (numbers coerced, blanks → null). */
export function formToMedicalProfile(form) {
  const out = {};
  Object.entries(form).forEach(([k, v]) => {
    if (v === "" || v === null || v === undefined) {
      out[k] = null;
      return;
    }
    if (["age"].includes(k)) {
      const n = parseInt(v, 10);
      out[k] = Number.isFinite(n) ? n : null;
    } else if (["height_cm", "weight_kg", "water_intake_liters"].includes(k)) {
      const n = parseFloat(v);
      out[k] = Number.isFinite(n) ? n : null;
    } else {
      out[k] = String(v);
    }
  });
  return out;
}

/** Display helpers used by read-only renderer. */
const READABLE_LABELS = {
  gender: Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label])),
  food_preference: Object.fromEntries(FOOD_PREF_OPTIONS.map((o) => [o.value, o.label])),
  physical_activity_level: Object.fromEntries(ACTIVITY_OPTIONS.map((o) => [o.value, o.label])),
};

export function humanizeMedicalValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (READABLE_LABELS[field]) return READABLE_LABELS[field][value] || value;
  if (field === "height_cm") return `${value} cm`;
  if (field === "weight_kg") return `${value} kg`;
  if (field === "water_intake_liters") return `${value} L / day`;
  return String(value);
}

/**
 * Editable medical profile fields. Pass `value` (form-shape) and `onChange(field, value)`.
 * Set `disabled` to render in a read-only-flavored way (e.g. while saving).
 */
export default function MedicalProfileFields({ value, onChange, disabled = false }) {
  const v = value || MEDICAL_PROFILE_DEFAULTS;
  const set = (k) => (e) => onChange(k, e.target ? e.target.value : e);

  return (
    <div className="space-y-4">
      {/* Identity */}
      <Section title="Identity">
        <Field label="Full name">
          <Input
            value={v.full_name}
            onChange={set("full_name")}
            disabled={disabled}
            placeholder="As on official records"
            data-testid="med-full-name"
          />
        </Field>
        <Field label="Phone number">
          <Input
            value={v.phone_number}
            onChange={set("phone_number")}
            disabled={disabled}
            placeholder="+91 98765 43210"
            inputMode="tel"
            data-testid="med-phone"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age">
            <Input
              type="number"
              min={0}
              max={150}
              value={v.age}
              onChange={set("age")}
              disabled={disabled}
              data-testid="med-age"
            />
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              value={v.date_of_birth}
              onChange={set("date_of_birth")}
              disabled={disabled}
              data-testid="med-dob"
            />
          </Field>
        </div>
        <Field label="Gender">
          <Select
            value={v.gender || undefined}
            onValueChange={(val) => onChange("gender", val)}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 rounded-xl" data-testid="med-gender">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Address">
          <Textarea
            value={v.address}
            onChange={set("address")}
            disabled={disabled}
            rows={2}
            placeholder="Street, city, country"
            data-testid="med-address"
          />
        </Field>
      </Section>

      {/* Anthropometry & vitals */}
      <Section title="Body metrics">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Height (cm)">
            <Input
              type="number"
              step="0.1"
              min={0}
              value={v.height_cm}
              onChange={set("height_cm")}
              disabled={disabled}
              data-testid="med-height"
            />
          </Field>
          <Field label="Weight (kg)">
            <Input
              type="number"
              step="0.1"
              min={0}
              value={v.weight_kg}
              onChange={set("weight_kg")}
              disabled={disabled}
              data-testid="med-weight"
            />
          </Field>
        </div>
        <Field label="Blood group">
          <Select
            value={v.blood_group || undefined}
            onValueChange={(val) => onChange("blood_group", val)}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 rounded-xl" data-testid="med-blood">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {BLOOD_GROUP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {/* Clinical */}
      <Section title="Clinical">
        <Field label="Medical conditions">
          <Textarea
            value={v.medical_conditions}
            onChange={set("medical_conditions")}
            disabled={disabled}
            rows={2}
            placeholder="Diabetes, hypertension, etc."
            data-testid="med-conditions"
          />
        </Field>
        <Field label="Current medications">
          <Textarea
            value={v.current_medications}
            onChange={set("current_medications")}
            disabled={disabled}
            rows={2}
            placeholder="Drug · dose · frequency"
            data-testid="med-medications"
          />
        </Field>
        <Field label="Allergies">
          <Textarea
            value={v.allergies}
            onChange={set("allergies")}
            disabled={disabled}
            rows={2}
            placeholder="Food, drug, environmental"
            data-testid="med-allergies"
          />
        </Field>
      </Section>

      {/* Lifestyle */}
      <Section title="Lifestyle">
        <Field label="Food preference">
          <Select
            value={v.food_preference || undefined}
            onValueChange={(val) => onChange("food_preference", val)}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 rounded-xl" data-testid="med-food-pref">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {FOOD_PREF_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Water intake (L/day)">
            <Input
              type="number"
              step="0.1"
              min={0}
              value={v.water_intake_liters}
              onChange={set("water_intake_liters")}
              disabled={disabled}
              data-testid="med-water"
            />
          </Field>
          <Field label="Activity level">
            <Select
              value={v.physical_activity_level || undefined}
              onValueChange={(val) => onChange("physical_activity_level", val)}
              disabled={disabled}
            >
              <SelectTrigger className="h-10 rounded-xl" data-testid="med-activity">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Health goal">
          <Input
            value={v.health_goal}
            onChange={set("health_goal")}
            disabled={disabled}
            placeholder="Weight loss / gain / maintain / strength"
            data-testid="med-goal"
          />
        </Field>
      </Section>

      {/* Consult */}
      <Section title="Consultation">
        <Field label="Consultation date">
          <Input
            type="date"
            value={v.consultation_date}
            onChange={set("consultation_date")}
            disabled={disabled}
            data-testid="med-consultation"
          />
        </Field>
        <Field label="Remarks / notes">
          <Textarea
            value={v.remarks}
            onChange={set("remarks")}
            disabled={disabled}
            rows={3}
            placeholder="Anything else the team should know"
            data-testid="med-remarks"
          />
        </Field>
      </Section>
    </div>
  );
}

/**
 * Read-only summary card. Renders the same fields as a clean labeled list.
 * Used by client/employee surfaces where editing is not allowed.
 */
export function MedicalProfileReadOnly({ profile }) {
  const empty = !profile || Object.values(profile).every(
    (v) => v === null || v === undefined || v === "",
  );
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center" data-testid="med-empty">
        <p className="text-sm font-medium text-gray-700">No medical profile on file yet</p>
        <p className="text-xs text-gray-500 mt-1">
          Your administrator will add your medical details. You'll see them here once they do.
        </p>
      </div>
    );
  }

  const rows = [
    ["Full name", "full_name"],
    ["Phone number", "phone_number"],
    ["Age", "age"],
    ["Date of birth", "date_of_birth"],
    ["Gender", "gender"],
    ["Address", "address"],
    ["Height", "height_cm"],
    ["Weight", "weight_kg"],
    ["Blood group", "blood_group"],
    ["Medical conditions", "medical_conditions"],
    ["Current medications", "current_medications"],
    ["Allergies", "allergies"],
    ["Food preference", "food_preference"],
    ["Water intake", "water_intake_liters"],
    ["Activity level", "physical_activity_level"],
    ["Health goal", "health_goal"],
    ["Consultation date", "consultation_date"],
    ["Remarks / notes", "remarks"],
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100" data-testid="med-readonly">
      {rows.map(([label, key]) => (
        <div key={key} className="px-4 py-2.5 grid grid-cols-3 gap-3 items-start">
          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 col-span-1">{label}</div>
          <div className="text-sm text-gray-800 col-span-2 whitespace-pre-wrap break-words" data-testid={`med-ro-${key}`}>
            {humanizeMedicalValue(key, profile[key])}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-900/70 font-medium">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">{label}</Label>
      {children}
    </div>
  );
}
