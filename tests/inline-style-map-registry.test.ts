import {expect,it} from 'vitest';
import {inlineStyleMapOwners} from '../scripts/inline-style-map-owners.mjs';
import {tsStateStyleOwner} from '../scripts/ts-state-style-owner.mjs';
import {tsStaticStyleOwner} from '../scripts/ts-static-style-owner.mjs';
it('registers the complete independently maintained TS static owner for clean pre-emission bootstrap',()=>{expect(inlineStyleMapOwners.filter(owner=>owner.id===tsStaticStyleOwner.id)).toEqual([tsStaticStyleOwner]);});
it('registers the complete fixed state owner for clean pre-emission bootstrap',()=>{expect(inlineStyleMapOwners.filter(owner=>owner.id===tsStateStyleOwner.id)).toEqual([tsStateStyleOwner]);});
