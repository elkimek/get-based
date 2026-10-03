export interface ShareLocation {hostname?:unknown;pathname?:unknown;origin?:unknown;hash?:unknown;href?:unknown;search?:unknown}
// Private property-operation reader; validation does not canonicalize unchecked JSON leaves or getter rereads.
export interface RawExportOperations {version?:unknown;profile:{name?:unknown};entries?:unknown}
export interface ShareEnvelopeReader {schema?:unknown;version?:unknown;expiresAt?:unknown;kdf?:{name?:unknown;hash?:unknown;salt?:unknown;iterations?:unknown}|null;cipher?:{name?:unknown;iv?:unknown}|null;ciphertext?:unknown;compression?:unknown}
export interface ShareEnvelope {schema:string;version:number;createdAt:string;expiresAt:unknown;kdf:{name:string;hash:string;iterations:number;salt:string};cipher:{name:string;iv:string};compression:string;ciphertext:string}
export interface EncryptShareOptions {iterations?:unknown;expiresAt?:unknown;expiresDays?:unknown}
export interface CreateProfileShareOptions {profileId?:string|undefined;password?:unknown;expiresDays?:unknown}
export interface RawShareRecord {id?:unknown;profileId?:unknown;profileName?:unknown;shareUrl?:unknown;manageToken?:unknown;createdAt?:unknown;expiresAt?:unknown}
// String() copies normalize these fields; id remains an unchecked original leaf.
export interface ShareRecord {id:unknown;profileId:string;profileName:unknown;shareUrl:string;manageToken:string;createdAt:string;expiresAt:unknown}
// Private Date constructor operation view only; this does not validate a supplied expiry.
export interface ShareResultReader {profileName:unknown;profileId?:unknown;shareUrl:unknown;password:unknown;expiresAt:ConstructorParameters<typeof Date>[0]}
export type ShareControl = HTMLButtonElement|HTMLInputElement|HTMLSelectElement;
export type ShareFormTarget = Pick<HTMLFormElement,'dataset'|'querySelector'>;
export type ShareClickTarget = {closest<ElementType extends Element>(selector:string):ElementType|null};

export type CreatedShareOperations = Omit<Awaited<ReturnType<typeof import('../js/profile-share.js').createProfileShare>>, 'expiresAt'> & {expiresAt: ConstructorParameters<typeof Date>[0]};
