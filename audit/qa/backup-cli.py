"""PTY checks for the local backup CLI. Only synthetic data; no network or third-party packages.
Run from repository root: python audit/qa/backup-cli.py
POSIX terminal only; this does not certify Windows or physical mobile devices.
"""
from pathlib import Path
import os, pty, select, subprocess, tempfile, json, time, errno
ROOT=Path(__file__).resolve().parents[2]
PASS='SYNTHETIC CLI TEST ONLY cedar river mountain'
RESULTS=[]
def command(args,answers):
    master,slave=pty.openpty()
    proc=subprocess.Popen(['node',str(ROOT/'audit/field-backup-cli.mjs'),*args],stdin=slave,stdout=slave,stderr=slave,cwd=ROOT)
    os.close(slave)
    output=b''; pending=list(answers); started=time.monotonic()
    try:
        while True:
            if time.monotonic()-started>25: raise RuntimeError('CLI timed out')
            ready,_,_=select.select([master],[],[],.1)
            if ready:
                try: chunk=os.read(master,8192)
                except OSError as e:
                    if e.errno==errno.EIO: break
                    raise
                if not chunk: break
                output+=chunk
            if pending and pending[0][0].encode() in output:
                _,answer=pending.pop(0);os.write(master,(answer+'\n').encode())
            if proc.poll() is not None and not ready: break
        proc.wait(timeout=5)
        text=output.decode(errors='replace')
        assert PASS not in text, 'The passphrase was echoed!'
        return proc.returncode,text
    finally:
        os.close(master)
        if proc.poll() is None: proc.kill();proc.wait()
with tempfile.TemporaryDirectory(prefix='safi-cli-check-') as base:
    root=Path(base);source=root/'source';backups=root/'backups';source.mkdir(mode=0o700);backups.mkdir(mode=0o700)
    module=(ROOT/'audit/field-evidence-store.mjs').as_uri()
    subprocess.run(['node','--input-type=module','-e',f'import {{openEvidenceStore}} from {json.dumps(module)};const s=openEvidenceStore({{storageDir:process.argv[1]}});s.close();',str(source)],check=True,capture_output=True)
    code,text=command(['create',str(source),str(backups)],[('Nueva frase',PASS),('Repita la frase',PASS)])
    assert code==0,text; assert len(list(backups.glob('*.safibak')))==1
    RESULTS.append('PASS: interactive create, verification and hidden passphrase')
    archive=next(backups.glob('*.safibak'))
    code,text=command(['verify',str(archive)],[('Frase de acceso',PASS)])
    assert code==0,text;RESULTS.append('PASS: independent CLI verification')
    dest=root/'recovered'
    code,text=command(['restore',str(archive),str(dest)],[('Frase de acceso','WRONG SYNTHETIC PASSWORD EXAMPLE')])
    assert code!=0 and not dest.exists(),text;RESULTS.append('PASS: wrong passphrase creates no restored directory')
    code,text=command(['restore',str(archive),str(dest)],[('Frase de acceso',PASS)])
    assert code==0 and (dest/'field-demo.sqlite').exists(),text;RESULTS.append('PASS: fresh-directory restore')
    before=(dest/'field-demo.sqlite').read_bytes()
    code,text=command(['restore',str(archive),str(dest)],[('Frase de acceso',PASS)])
    assert code!=0 and before==(dest/'field-demo.sqlite').read_bytes(),text;RESULTS.append('PASS: existing restored database cannot be overwritten')
    code,text=command(['create',str(source),str(backups)],[('Nueva frase',PASS),('Repita la frase','DIFFERENT SYNTHETIC PASSWORD')])
    assert code!=0 and len(list(backups.glob('*.safibak')))==1,text;RESULTS.append('PASS: confirmation mismatch creates no archive')
print('\n'.join(RESULTS))
output=ROOT/'results/backup';output.mkdir(parents=True,exist_ok=True)
(output/'cli-checks.json').write_text(json.dumps({'passed':len(RESULTS),'failed':0,'checks':RESULTS,'scope':'POSIX PTY with synthetic SQLite database and real crypto/filesystem; no real records'},indent=2))
