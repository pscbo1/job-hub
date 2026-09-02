import { ApplicationPacketWorkbench } from "@/components/ApplicationPacketWorkbench";

export default async function ApplicationPacketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationPacketWorkbench appId={id} />;
}
