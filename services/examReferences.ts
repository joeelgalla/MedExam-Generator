import type {UploadedFile} from '../types.ts';
const words=(s:string)=>s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
// This catches verbatim passages; the model still checks conceptual near-copies.
// Shared medical terms and short answer phrases are expected, not spoilers.
export function copiesExamReference(text:string,files:UploadedFile[]):boolean {
  const width=12, candidate=words(text);
  if(candidate.length<width)return false;
  const shingles=new Set(candidate.slice(0,-width+1).map((_,i)=>candidate.slice(i,i+width).join(' ')));
  return files.some(f=>{const w=words(f.content);return w.slice(0,-width+1).some((_,i)=>shingles.has(w.slice(i,i+width).join(' ')));});
}
