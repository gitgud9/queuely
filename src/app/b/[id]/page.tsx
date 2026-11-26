import { Visitor } from "./Visitor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Visitor id={id} />;
}
