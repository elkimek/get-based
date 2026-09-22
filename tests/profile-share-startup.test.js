import { EventEmitter } from 'node:events';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({server:null,store:null,create:vi.fn(),maintain:vi.fn(),signals:{},listenError:null}));
vi.mock('node:http',()=>({createServer:()=>m.server}));
vi.mock('../lib/profile-share-sqlite-store.js',()=>({createSqliteProfileShareStore:m.create}));
vi.mock('../lib/profile-share-service.js',()=>({handleProfileShareRequest:vi.fn(),maintainProfileShareStorage:m.maintain}));
import { startProfileShareServer } from '../server/profile-share-server.js';
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();m.signals={};m.listenError=null;
 m.store={check:vi.fn(),close:vi.fn()};m.create.mockReturnValue(m.store);m.maintain.mockResolvedValue();
 m.server=Object.assign(new EventEmitter(),{listen:vi.fn((_port,_host,cb)=>{if(m.listenError)m.server.emit('error',m.listenError);else cb();}),close:vi.fn(cb=>cb())});
 for(const key of ['PROFILE_SHARE_BIND','PROFILE_SHARE_PORT','PROFILE_SHARE_SQLITE_PATH','PROFILE_SHARE_RATE_LIMIT_KEY','PROFILE_SHARE_DATABASE_MAX_BYTES'])vi.stubEnv(key,'');
 vi.spyOn(process.stdout,'write').mockReturnValue(true);vi.spyOn(process,'exit').mockImplementation(()=>{});
 const once=process.once.bind(process);vi.spyOn(process,'once').mockImplementation((event,cb)=>{if(['SIGINT','SIGTERM'].includes(event)){m.signals[event]=cb;return process;}return once(event,cb);});
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();});
it('checks storage and runs maintenance before listening on defaults',async()=>{
 const result=await startProfileShareServer();expect(result).toEqual({server:m.server,store:m.store});expect(m.store.check).toHaveBeenCalledOnce();expect(m.maintain).toHaveBeenCalledWith(m.store);expect(m.server.listen).toHaveBeenCalledWith(8790,'0.0.0.0',expect.any(Function));
 await vi.advanceTimersByTimeAsync(3600000);expect(m.maintain).toHaveBeenCalledTimes(2);
});
it('survives initial and periodic maintenance rejection',async()=>{
 m.maintain.mockRejectedValue(new Error('temporary'));await startProfileShareServer();await vi.advanceTimersByTimeAsync(3600000);expect(m.server.listen).toHaveBeenCalledOnce();expect(m.maintain).toHaveBeenCalledTimes(2);
});
it('passes configured storage and bind options',async()=>{
 vi.stubEnv('PROFILE_SHARE_BIND','127.0.0.1');vi.stubEnv('PROFILE_SHARE_PORT','9020');vi.stubEnv('PROFILE_SHARE_SQLITE_PATH','/fixture/shares.sqlite');vi.stubEnv('PROFILE_SHARE_RATE_LIMIT_KEY','private-key');vi.stubEnv('PROFILE_SHARE_DATABASE_MAX_BYTES','1000000');
 await startProfileShareServer();expect(m.create).toHaveBeenCalledWith({databasePath:'/fixture/shares.sqlite',rateLimitHmacKey:'private-key',maxDatabaseBytes:'1000000'});expect(m.server.listen).toHaveBeenCalledWith(9020,'127.0.0.1',expect.any(Function));expect(process.stdout.write.mock.calls.flat().join('')).not.toContain('private-key');
});
it.each(['0','65536','invalid'])('uses the default for invalid port %s',async port=>{vi.stubEnv('PROFILE_SHARE_PORT',port);await startProfileShareServer();expect(m.server.listen).toHaveBeenCalledWith(8790,'0.0.0.0',expect.any(Function));});
it.each(['SIGINT','SIGTERM'])('closes storage and cancels maintenance on %s',async signal=>{
 await startProfileShareServer();m.signals[signal]();expect(m.store.close).toHaveBeenCalledOnce();expect(process.exit).toHaveBeenCalledWith(0);await vi.advanceTimersByTimeAsync(3600000);expect(m.maintain).toHaveBeenCalledOnce();
});
it('forces an exit when the HTTP server cannot drain',async()=>{
 await startProfileShareServer();m.server.close.mockImplementation(()=>{});m.signals.SIGTERM();await vi.advanceTimersByTimeAsync(10000);expect(process.exit).toHaveBeenCalledWith(1);
});
it('still exits when closing storage throws',async()=>{await startProfileShareServer();m.store.close.mockImplementation(()=>{throw new Error('close failed');});m.signals.SIGTERM();expect(process.exit).toHaveBeenCalledWith(0);});
it('cleans storage after its startup health check fails',async()=>{
 m.store.check.mockImplementation(()=>{throw new Error('check failed');});await expect(startProfileShareServer()).rejects.toThrow('check failed');expect(m.store.close).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('cleans storage and maintenance after listening fails',async()=>{
 m.listenError=new Error('port busy');await expect(startProfileShareServer()).rejects.toThrow('port busy');expect(m.store.close).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);expect(m.signals).toEqual({});
});
it('does not close storage twice when both shutdown signals arrive',async()=>{
 await startProfileShareServer();m.signals.SIGINT();m.signals.SIGTERM();expect(m.server.close).toHaveBeenCalledOnce();expect(m.store.close).toHaveBeenCalledOnce();
});
