interface StyleRegion {start:number;end:number;body:string;}
function one(index:string,needle:string):number {
 const start=index.indexOf(needle);
 if(start<0||index.indexOf(needle,start+needle.length)>=0)throw Error('Expected one inline style boundary: '+needle);
 return start;
}
/** Replace only the two eager stylesheet bodies; all other document bytes remain owned by their authors. */
export function withInlineThemeStyleSnapshot(index:string,critical:string,modes:string):string {
 if(/<\/style\b/i.test(critical)||/<\/style\b/i.test(modes))throw Error('Inline CSS cannot close its style element');
 const head=one(index,'<head>'),headEnd=one(index,'</head>');
 if(headEnd<head)throw Error('Invalid head order');
 const styles=[...index.slice(head,headEnd).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)];
 function region(tag:string):StyleRegion {
  const matched=styles.filter(match=>match[0].slice(0,match[0].indexOf('>')+1)===tag);
  if(matched.length!==1)throw Error('Expected one owned inline style: '+tag);
  const match=matched[0]!,start=head+match.index+tag.length,body=match[1]!;
  return{start,end:start+body.length,body};
 }
 const early=region('<style>'),shared=region('<style data-shared-theme-modes>');
 if(!/^\s*#main-content\s*\{/.test(early.body))throw Error('Expected critical main-content stylesheet');
 const boot=one(index,'<script src="js/theme-bootstrap.js"></script>'),fonts=one(index,'<link rel="stylesheet" href="vendor/fonts/fonts.css">');
 const optional=one(index,'<meta data-extra-themes-stylesheet-anchor>'),extraBoot=one(index,'<script src="js/extra-theme-bootstrap.js"></script>');
 if(!(head<boot&&boot<early.start&&early.end<fonts&&fonts<optional&&optional<extraBoot&&extraBoot<shared.start&&shared.end<headEnd))throw Error('Inline first-paint stylesheet positions must remain exact');
 return index.slice(0,early.start)+critical+index.slice(early.end,shared.start)+modes+index.slice(shared.end);
}
