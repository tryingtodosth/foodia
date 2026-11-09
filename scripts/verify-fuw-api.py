# Session 29 — API checks for the /fuw cookbook form (docs/fuw.md): anonymous uploads and
# submissions, every validation refusal, the honeypot, the private-until-accepted media gate,
# admin accept/export/promote/delete, and the hourly rate limit. 40 assertions.
#
# Needs `npm run dev` running and a session token for an ADMIN_EMAILS account in a file:
#   python3 -I scripts/verify-fuw-api.py /path/to/admin.token [http://localhost:5173]
# It writes real rows to LOCAL D1/R2 and uses up this IP's 5-per-hour submission allowance;
# clean up afterwards from /admin/fuw (delete the test submissions and promoted recipes).
import json, sys, urllib.request, urllib.error, uuid, struct, zlib
BASE=sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:5173'
TOKEN=open(sys.argv[1]).read().strip()
ADMIN={'cookie':f'foodia-session={TOKEN}'}
ok=fail=0
def check(name, cond, extra=''):
    global ok, fail
    if cond: ok+=1; print('PASS', name)
    else: fail+=1; print('FAIL', name, extra)
def req(method, path, body=None, headers=None, raw=None, ctype=None):
    h=dict(headers or {})
    data=None
    if body is not None: data=json.dumps(body).encode(); h['content-type']='application/json'
    if raw is not None: data=raw; h['content-type']=ctype
    r=urllib.request.Request(BASE+path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r) as resp: return resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e: return e.code, e.read(), e.headers
def png():
    def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\x00\x00'))+chunk(b'IEND',b'')
def upload(data, mime):
    b='----'+uuid.uuid4().hex
    body=(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="x"\r\nContent-Type: {mime}\r\n\r\n').encode()+data+f'\r\n--{b}--\r\n'.encode()
    return req('POST','/api/fuw/uploads', raw=body, ctype=f'multipart/form-data; boundary={b}')

s,b,_=upload(png(),'image/png'); check('upload png 201', s==201, b); hero=json.loads(b)
s,b,_=upload(png(),'image/png'); extra=json.loads(b)
s,b,_=upload(b'not an image at all, really','image/png'); check('upload fake png 415', s==415, s)
s,_,_=req('GET','/api/media/'+hero['key']); check('unreviewed media anon 404', s==404, s)
s,_,h=req('GET','/api/media/'+hero['key'], headers=ADMIN); check('unreviewed media admin 200', s==200, s)
check('fuw media private cache', 'private' in (h.get('cache-control') or ''), h.get('cache-control'))

def payload(**kw):
    p={'recipe':{'name':'=Pierogi kwantowe','summary':'Pierogi w superpozycji.','description':'Najlepsze po kolokwium.','heroImage':hero['url'],
      'tags':['obiad'],'dietFlags':['wegetariańskie'],'requiredEquipment':['oven','bogus'],'timeMinutes':60,'macros':{'kcal':0,'proteinG':0,'fatG':0,'carbsG':0},
      'ingredients':[{'name':'Mąka','quantity':500,'unit':'g'},{'name':'Ziemniaki','quantity':1,'unit':'kg'}],
      'steps':[{'text':'Zagnieć ciasto.','ingredientIndexes':[0]},{'text':'Ugotuj ziemniaki.','durationMinutes':20,'ingredientIndexes':[1]}],'sourceLocale':'pl'},
      'authorName':'prof. dr hab. Anna Testowa','affiliation':'professor','affiliationDetail':'Zakład Fizyki Teoretycznej','email':'anna@example.com',
      'story':'Od babci.','photoKeys':[extra['key']],'consent':True,'locale':'pl','website':''}
    for k,v in kw.items():
        if k.startswith('r_'): p['recipe'][k[2:]]=v
        else: p[k]=v
    return p

s,b,_=req('POST','/api/fuw/submissions', payload(consent=False)); check('no consent 400', s==400, b)
s,b,_=req('POST','/api/fuw/submissions', payload(email='nope')); check('bad email 400', s==400, b)
s,b,_=req('POST','/api/fuw/submissions', payload(affiliation='dean')); check('bad affiliation 400', s==400, b)
s,b,_=req('POST','/api/fuw/submissions', payload(r_heroImage='javascript:alert(1)')); check('js hero 400', s==400, b)
s,b,_=req('POST','/api/fuw/submissions', payload(r_heroImage='/api/media/recipes/u1/x.jpg')); check('other R2 path hero 400', s==400, b)
s,b,_=req('POST','/api/fuw/submissions', payload(r_name='x'*201)); check('name too long 400', s==400, b)
s,b,_=req('POST','/api/fuw/submissions', payload(r_steps=[{'text':'a','ingredientIndexes':[9]}])); check('bad step index 400', s==400, b)
s,b,_=req('POST','/api/fuw/submissions', payload(photoKeys=['fuw/'+str(uuid.uuid4())+'.png'])); check('unknown photo key 400', s==400, b)

s,b,_=req('GET','/api/admin/fuw/export?format=json&status=all', headers=ADMIN); before=len(json.loads(b))
s,b,_=req('POST','/api/fuw/submissions', payload(website='http://spam')); check('honeypot answers 201', s==201, b)
s,b,_=req('GET','/api/admin/fuw/export?format=json&status=all', headers=ADMIN); check('honeypot stored nothing', len(json.loads(b))==before)

s,b,_=req('POST','/api/fuw/submissions', payload()); check('valid submission 201', s==201, b); sid=json.loads(b)['id']
s,b,_=req('POST','/api/fuw/submissions', payload()); check('reused photo keys 400', s==400, b)

s,b,_=req('GET','/api/admin/fuw/export?format=json&status=all'); check('export anon 404', s==404, s)
s,b,_=req('GET','/api/admin/fuw/export?format=json&status=all', headers=ADMIN)
sub=[x for x in json.loads(b) if x['id']==sid][0]
check('stored equipment filtered', sub['recipe']['requiredEquipment']==['oven'], sub['recipe']['requiredEquipment'])
check('extra photo listed', sub['photoKeys']==[extra['key']], sub['photoKeys'])

s,_,_=req('PATCH',f'/api/admin/fuw/{sid}', {'status':'accepted'}); check('patch anon 404', s==404, s)
s,_,_=req('PATCH',f'/api/admin/fuw/{sid}', {'status':'accepted'}, headers=ADMIN); check('accept 204', s==204, s)
s,_,_=req('GET','/api/media/'+hero['key']); check('accepted media anon 200', s==200, s)
s,_,_=req('GET','/api/media/'+extra['key']); check('accepted extra photo anon 200', s==200, s)

s,b,h=req('GET','/api/admin/fuw/export?format=csv', headers=ADMIN); txt=b.decode('utf-8')
check('csv BOM', txt.startswith('﻿')); check('csv has recipe', "'=Pierogi kwantowe" in txt, txt[:300]); check('csv attachment', 'attachment' in h.get('content-disposition',''))
check('csv only accepted rows', 'Pierogi' in txt and txt.count('\r\n')-1 == len([x for x in json.loads(req('GET','/api/admin/fuw/export?format=json',headers=ADMIN)[1])]))

s,b,_=req('POST',f'/api/admin/fuw/{sid}/promote', headers=ADMIN); check('promote 201', s==201, b); rid=json.loads(b)['recipeId']
s,b,_=req('POST',f'/api/admin/fuw/{sid}/promote', headers=ADMIN); check('promote twice 409', s==409, s)
s,b,_=req('GET',f'/api/recipes/{rid}'); r=json.loads(b)
check('promoted recipe public', s==200)
check('promoted author is cookbook', r['author']['displayName']=='Książka kucharska FUW', r['author'])
check('promoted tag fuw', 'fuw' in r['tags'], r['tags'])
check('credit in description', 'Anna Testowa' in r['description'] and 'profesor' in r['description'], r['description'])
check('email not leaked', 'anna@example.com' not in json.dumps(r))
check('step links kept', r['steps'][0]['ingredientIds']==[r['ingredients'][0]['id']])
s,b,_=req('DELETE',f'/api/admin/fuw/{sid}', headers=ADMIN); check('delete promoted 409', s==409, s)

# a second submission to delete
s,b,_=upload(png(),'image/png'); k2=json.loads(b)
s,b,_=req('POST','/api/fuw/submissions', payload(r_heroImage=k2['url'], photoKeys=[], r_sourceLocale='en', locale='en', affiliation='student')); sid2=json.loads(b)['id']
s,_,_=req('DELETE',f'/api/admin/fuw/{sid2}', headers=ADMIN); check('delete 204', s==204, s)
s,_,_=req('GET','/api/media/'+k2['key'], headers=ADMIN); check('deleted photo gone from R2', s==404, s)

# rate limit: keep submitting until 429 (cap is 5/hour per IP hash)
codes=[]
for i in range(7):
    s,b,_=req('POST','/api/fuw/submissions', payload(photoKeys=[], r_heroImage=''))
    codes.append(s)
check('rate limit hits 429', 429 in codes, codes)
print(f'\n{ok} passed, {fail} failed'); print('PROMOTED', rid)
