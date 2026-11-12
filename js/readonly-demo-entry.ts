/// <reference path="./public-demo-data.d.ts" />
import Demo, {mount} from './components/ReadonlyDemo.svelte.native.js';
import type {DemoProfile} from './readonly-demo-model.js';
// Replaced only by the dedicated build, using committed fictional fixtures.
import {profiles} from 'getbased:public-demo-data';
mount(Demo, {target: document.getElementById('demo-root')!, props: {profiles: profiles as DemoProfile[]}});
