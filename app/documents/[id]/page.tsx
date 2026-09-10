// La coquille : elle ne fait qu'attendre le paramètre d'adresse. Tout le reste
// est client, comme les autres écrans de l'application — le module documentaire
// n'introduit pas une seconde façon de charger un écran.

import { DocumentDetailClient } from './DocumentDetailClient';

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DocumentDetailClient documentId={id} />;
}
