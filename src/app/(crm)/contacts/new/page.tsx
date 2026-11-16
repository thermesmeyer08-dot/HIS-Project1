import { requireUser } from "@/lib/auth";
import { createContact } from "@/app/actions/contacts";
import { ContactFields } from "@/components/contact-fields";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";

export default async function NewContactPage({ searchParams }: PageProps<"/contacts/new">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const { data: orgs } = await supabase.from("organizations").select("id, name").order("name");
  return (
    <>
      <PageHeader title="Add contact" subtitle="Duplicates are detected by email, LinkedIn URL, or name + business." />
      <Card>
        <ActionForm action={createContact} className="space-y-4">
          <ContactFields orgs={orgs ?? []} defaultType={typeof sp.type === "string" ? sp.type : "prospect"} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="create_lead" defaultChecked /> Also open a lead for this person
          </label>
          <SubmitButton>Save contact</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
