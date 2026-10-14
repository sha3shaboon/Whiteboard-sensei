// Molecular structures from PubChem (https://pubchem.ncbi.nlm.nih.gov): real 2D depictions by
// name or SMILES, so the tutor never invents a structure.

export interface Molecule {
  cid: number;
  title: string;
  formula: string;
  iupac: string;
  weight: string;
  atoms: { el: string; x: number; y: number; charge?: number }[];
  bonds: { a: number; b: number; order: number }[];
}

export type MoleculeLoader = (q: { name?: string; smiles?: string }) => Promise<Molecule | null>;

const API = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

// Atomic numbers -> symbols (enough for school and university chemistry).
const SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba ' +
  'La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn').split(' ');

interface PcCompound {
  id: { id: { cid: number } };
  atoms: { aid: number[]; element: number[]; charge?: { aid: number; value: number }[] };
  bonds?: { aid1: number[]; aid2: number[]; order: number[] };
  coords: { aid: number[]; conformers: { x: number[]; y: number[] }[] }[];
}

export function parseRecord(rec: PcCompound, props: { Title?: string; MolecularFormula?: string; IUPACName?: string; MolecularWeight?: string }): Molecule {
  const aidIndex = new Map(rec.atoms.aid.map((aid, i) => [aid, i]));
  const c = rec.coords[0]!;
  const conf = c.conformers[0]!;
  const xy = new Map(c.aid.map((aid, i) => [aid, { x: conf.x[i]!, y: conf.y[i]! }]));
  const charge = new Map((rec.atoms.charge ?? []).map((ch) => [ch.aid, ch.value]));
  const atoms = rec.atoms.aid.map((aid, i) => ({
    el: SYMBOLS[rec.atoms.element[i]! - 1] ?? '?',
    x: xy.get(aid)?.x ?? 0,
    y: xy.get(aid)?.y ?? 0,
    ...(charge.get(aid) ? { charge: charge.get(aid)! } : {}),
  }));
  const b = rec.bonds ?? { aid1: [], aid2: [], order: [] };
  const bonds = b.aid1.map((a1, i) => ({ a: aidIndex.get(a1)!, b: aidIndex.get(b.aid2[i]!)!, order: b.order[i] ?? 1 }));
  return {
    cid: rec.id.id.cid,
    title: props.Title ?? '',
    formula: props.MolecularFormula ?? '',
    iupac: props.IUPACName ?? '',
    weight: props.MolecularWeight ?? '',
    atoms,
    bonds,
  };
}

export function createMoleculeLoader(fetchImpl: typeof fetch = fetch): MoleculeLoader {
  const cache = new Map<string, Molecule | null>();
  const json = async (url: string, init?: RequestInit) => {
    const res = await fetchImpl(url, init);
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`PubChem ${res.status}`);
    return res.json() as Promise<any>;
  };
  return async ({ name, smiles }) => {
    const key = smiles ? `smiles:${smiles}` : `name:${(name ?? '').trim().toLowerCase()}`;
    if (cache.has(key)) return cache.get(key)!;
    const ids = smiles
      ? await json(`${API}/compound/smiles/cids/JSON`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ smiles }) })
      : await json(`${API}/compound/name/${encodeURIComponent(name!.trim())}/cids/JSON`);
    const cid = ids?.IdentifierList?.CID?.[0];
    let mol: Molecule | null = null;
    if (cid) {
      const [rec, props] = await Promise.all([
        json(`${API}/compound/cid/${cid}/JSON?record_type=2d`),
        json(`${API}/compound/cid/${cid}/property/Title,MolecularFormula,IUPACName,MolecularWeight/JSON`),
      ]);
      const compound = rec?.PC_Compounds?.[0];
      if (compound) mol = parseRecord(compound, props?.PropertyTable?.Properties?.[0] ?? {});
      if (mol && mol.atoms.length > 150) mol = null; // proteins etc. aren't drawable as a structure
    }
    if (cache.size > 1000) cache.clear();
    cache.set(key, mol);
    return mol;
  };
}
