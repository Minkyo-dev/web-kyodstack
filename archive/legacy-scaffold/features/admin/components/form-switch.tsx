"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface FormSwitchProps {
  id: string;
  name?: string;
  label: string;
  defaultChecked?: boolean;
}

export function FormSwitch({
  id,
  name,
  label,
  defaultChecked = false,
}: FormSwitchProps) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
