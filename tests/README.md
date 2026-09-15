# Les tests

`npm test`

## Pourquoi il n'y a aucune dépendance de test

Le poste de développement a 3 Go de disque libre et 3,7 Go de mémoire : une
chaîne de test complète (vitest, jest, leurs transpileurs) y coûte plus cher que
tout le reste du projet réuni, et s'installe à chaque `npm ci` de la CI.

Node 22+ retire les types TypeScript lui-même et embarque un lanceur de tests
(`node --test`). Il ne manquait qu'une chose : Node résout les imports ESM à
l'extension près, alors que le code écrit `from './currency'`. C'est ce que fait
`ts-resolve.mjs`, en quatorze lignes. Rien d'autre à installer, jamais.

## Ce qui est couvert, et pourquoi ceux-là

Ce premier lot ne cherche pas la couverture : il couvre **ce qui coûte de
l'argent au marchand quand ça casse**.

| Fichier | Ce qu'il protège |
|---|---|
| `actionResult.test.ts` | Le message d'erreur qui atteint le marchand. Un refus métier (« votre catalogue est plein ») doit lui parvenir ; un message de base de données, jamais. |
| `margin.test.ts` | Le calcul de marge, et surtout la règle « aucun taux de change inventé » : convertir à 1 afficherait 130 fois trop de marge sur du stock importé. |
| `currency.test.ts` | La conversion des rapports, et le décompte des montants laissés hors total. |
| `planFeatures.test.ts` | Les plafonds d'offre. Ce sont eux qui décident d'un paiement. |
| `storeHealth.test.ts` | La note de la boutique, et le fait qu'elle se taise sur un catalogue vide. |

## Ce qui n'est PAS couvert, et ne peut pas l'être ici

Les règles qui vivent en SQL — `confirm_store_order`, le signe des mouvements
de stock, les politiques RLS — ne s'exécutent pas dans Node. Elles se vérifient
contre une vraie base, et ce lot-là reste à écrire.
