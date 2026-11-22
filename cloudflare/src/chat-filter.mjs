/* Shared server-side chat censorship; never trust client-side masking.
 * Moderation is layered: plain-text validation, contact/links rejection,
 * profanity/slur masking, rate limits, report/block controls and a kill switch.
 */
const leet=Object.freeze({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s','!':'i','+':'t'});
const words=[
 'motherfucker','motherfucking','motherfuck','fucking','fucker','fucked','fuck','fuk','fck',
 'shitting','shitty','shit','bitches','bitch','asshole','ass','damn','bastard',
 'cunt','cock','dick','pussy','slut','whore','twat','piss','crap',
 'nigger','nigga','chink','faggot','fag','kike','spic','wetback','retard','tranny'
];
const slurs=new Set(['nigger','nigga','chink','faggot','fag','kike','spic','wetback','retard','tranny']);
const pattern=term=>term.split('').map(c=>c===' '?'[\\s._*~-]{1,3}':c+'+').join('[\\s._*~-]{0,2}');
const patterns=words.map(word=>({word,re:new RegExp('(^|[^a-z0-9])('+pattern(word)+')(?=$|[^a-z0-9])','g')}));
const directHarassment=[/kill[\s._*~-]{1,3}yourself/i,/go[\s._*~-]{1,3}die/i,/(^|[^a-z])kys(?=$|[^a-z])/i];
function fold(text){
 let normal='',positions=[];
 for(let i=0;i<text.length;){
  const symbol=String.fromCodePoint(text.codePointAt(i));
  let simplified=symbol.normalize('NFKC').normalize('NFD').replace(/\p{Mark}/gu,'').toLowerCase();
  if(/[\u200b-\u200f\u2060\ufeff]/u.test(symbol))simplified='';
  for(const point of simplified){
   // Treat punctuation as a letter only inside a word. Sentence-ending ! is not an i.
   const insideWord=/[a-z0-9]/i.test(text[i-1]||'')&&/[a-z0-9]/i.test(text[i+symbol.length]||'');
   const substitute=/[!@+$]/.test(point)&&!insideWord?point:leet[point]||point;
   const mapped=substitute;
   normal+=mapped;
   for(let j=0;j<mapped.length;j++)positions.push({from:i,to:i+symbol.length});
  }
  i+=symbol.length;
 }
 return {normal,positions};
}
export function censorChat(text){
 if(typeof text!=='string')throw TypeError('Chat text must be a string');
 const {normal,positions}=fold(text);
 if(directHarassment.some(re=>re.test(normal)))return {text:'',masked:0,slurs:0,blocked:true};
 const spans=[];
 for(const rule of patterns){
  rule.re.lastIndex=0;
  let match;
  while((match=rule.re.exec(normal))!==null){
   const start=match.index+match[1].length,end=start+match[2].length;
   if(positions[start]&&positions[end-1])spans.push({
    from:positions[start].from,to:positions[end-1].to,
    severe:slurs.has(rule.word)
   });
  }
 }
 spans.sort((a,b)=>a.from-b.from||b.to-a.to);
 let rendered='',last=0,masked=0,severe=0;
 for(const hit of spans){
  if(hit.from<last)continue;
  rendered+=text.slice(last,hit.from)+'***';
  last=hit.to;masked++;
  if(hit.severe)severe++;
 }
 return {text:rendered+text.slice(last),masked,slurs:severe,blocked:false};
}
export default censorChat;
