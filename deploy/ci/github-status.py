"""Publish this build's real result only, with a repository-scoped Jenkins credential."""
import json
import os
import re
import sys
import urllib.request
import urllib.error
state=sys.argv[1]
assert state in ('pending','success','failure','error')
revision=os.environ['ANISTATS_SOURCE_SHA']
assert re.fullmatch('[a-f0-9]{40}',revision)
body={'state':state,'context':'jenkins/anistats','description':'AniStats Linux build and tests: '+state,'target_url':os.environ['BUILD_URL']}
req=urllib.request.Request('https://api.github.com/repos/t1ggydev/AniStats/statuses/'+revision,
    data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+os.environ['ANISTATS_GITHUB_TOKEN'],
    'User-Agent':'AniStats-Jenkins','Accept':'application/vnd.github+json','Content-Type':'application/json'})
try:
    with urllib.request.urlopen(req,timeout=20) as response: assert response.status==201
    print('GitHub jenkins/anistats status published: '+state)
except urllib.error.HTTPError as error:
    print('GitHub status rejected: HTTP '+str(error.code));sys.exit(1)
