const anchors=new Set(['','[',']','[!','[-1','[0','[1','[2','[3']);
/** Ignore only fixed inert compiler anchors; preserve every actual field, ordered attribute and whitespace character. */
export function normalizeManualFormDOM(root:Node):void {
 const document=root.ownerDocument;if(!document)throw new Error('DOM owner required');
 const walk=document.createTreeWalker(root,128),remove:Node[]=[];
 for(let node=walk.nextNode();node;node=walk.nextNode())if(anchors.has(node.nodeValue??''))remove.push(node);
 for(const node of remove)node.parentNode?.removeChild(node);
 root.normalize();
}
