import { Display } from "./Display";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Display id={id} />;
}
