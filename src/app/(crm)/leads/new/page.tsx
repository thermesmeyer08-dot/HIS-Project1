import { requireUser } from "@/lib/auth";
import { createContact } from "@/app/actions/contacts";
import { ContactFields } from "@/components/contact-fields";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader } from "@/components/ui";

export default async function NewLeadPage() {
  const { supabase } = await requireUser();
  const { data: orgs } = await supabase.from("organizations").select("id, name").order("name");
  return (
    <>
      <PageHeader title="New lead" subtitle="Adds the person (if new) and opens a lead for them." />
      <Card>
        <ActionForm action={createContact} className="space-y-4">
          <input type="hidden" name="create_lead" value="on" />
          <ContactFields orgs={orgs ?? []} />
          <Field label="Niche" className="max-w-xs">
            <Input name="niche" defaultValue="business_owner" />
          </Field>
          <SubmitButton>Create lead</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
