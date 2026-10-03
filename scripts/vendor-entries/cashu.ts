import * as cashuts from '@cashu/cashu-ts';

(globalThis as typeof globalThis & {cashuts: typeof cashuts}).cashuts = cashuts;
