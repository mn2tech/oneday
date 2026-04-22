/**
 * Injected before </body> when SUPABASE_SERVICE_ROLE_KEY is set.
 * Shared Supabase-backed: messages, poll (2–12 options via #pollOpt0…), RSVP with adults/kids + list — same for all guests. Hosts see email invitations (Resend) when cloud + Resend are configured.
 *
 * Lives under /lib (not /pages) so Next.js does not treat this file as a route.
 */
export const INTERACTIONS_CLOUD = `<script>
(function(){
  function run(){
    var pathSegs = (window.location.pathname || '').split('/').filter(function(s){ return s && s.length; });
    var idFromPath = pathSegs.length ? pathSegs[pathSegs.length - 1] : '';
    var eid = (window.__ONEDAY_EID__ || idFromPath || 'event').slice(0,80);

    function esc(t){
      return String(t == null ? '' : t)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function pollVoterId(){
      var k='onet_poll_voter_'+eid;
      var v=localStorage.getItem(k);
      if(!v||v.length<8){
        v='';
        if(window.crypto&&crypto.getRandomValues){
          var a=new Uint8Array(16);
          crypto.getRandomValues(a);
          for(var i=0;i<16;i++) v+=('0'+a[i].toString(16)).slice(-2);
        } else {
          v=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
        }
        v=v.slice(0,64);
        localStorage.setItem(k,v);
      }
      return v;
    }

    /** Stable per-browser id for photo/message/RSVP ownership (32 hex chars). */
    function getDeviceId(){
      var k='onet_device_global_v1';
      var v=localStorage.getItem(k);
      if(!v||v.length<16){
        v='';
        if(window.crypto&&crypto.getRandomValues){
          var a=new Uint8Array(16);
          crypto.getRandomValues(a);
          for(var i=0;i<16;i++) v+=('0'+a[i].toString(16)).slice(-2);
        } else {
          v=('00000000000000000000000000000000'+Math.random().toString(16).replace(/[^a-f0-9]/g,'')).slice(-32);
        }
        v=String(v).toLowerCase().replace(/[^a-f0-9]/g,'');
        if(v.length<32){
          var pad=32-v.length;
          for(var j=0;j<pad;j++) v+='0';
        }
        v=v.slice(0,32);
        localStorage.setItem(k,v);
      }
      return v;
    }

    function getHostToken(){
      try{
        return sessionStorage.getItem('oneday_host_'+eid)||'';
      }catch(e){ return ''; }
    }

    function hostQs(){
      var t=getHostToken();
      return t ? '&hostToken='+encodeURIComponent(t) : '';
    }

    function withAdmin(obj){
      var t=getHostToken();
      if(t) obj.adminToken=t;
      return obj;
    }

    function findMsgSection(){
      return document.querySelector('#messages')||document.querySelector('section#messages')||document.querySelector('[id*="message-wall"]')||document.querySelector('section[class*="message"]:not([id*="rsvp"])');
    }
    function findMsgList(){
      var sec=findMsgSection();
      if(sec){
        var scoped=sec.querySelector('#msgList, #messageList, #msg-list, [class*="msg-list"], [class*="message-list"]');
        if(scoped) return scoped;
      }
      var ta=document.querySelector('#msgText');
      if(ta){
        var p=ta.closest('section');
        if(p){
          var s2=p.querySelector('#msgList, #messageList, #msg-list, [class*="message-list"]');
          if(s2) return s2;
        }
      }
      return document.querySelector('#msgList, #messageList, #msg-list');
    }
    function findMsgInputs(){
      var sec=findMsgSection();
      var ta=null, na=null;
      if(sec){
        ta=sec.querySelector('#msgText')||sec.querySelector('textarea');
        na=sec.querySelector('#msgName')||sec.querySelector('input[type="text"]');
      }
      if(!ta) ta=document.querySelector('#msgText')||document.querySelector('textarea[id*="msg"]');
      if(!na) na=document.querySelector('#msgName');
      return {ta:ta, na:na};
    }
    function wireMessageButtons(){
      var sec=findMsgSection();
      if(!sec) return;
      var sel='button.msg-submit,.msg-submit,[class*="msg-submit"],[class*="btn-post"],[id*="postBtn"],[id*="sendBtn"],[id*="msgBtn"],[id*="submitMsg"],[id*="postMessage"],button[class*="post-message"]';
      sec.querySelectorAll(sel).forEach(function(btn){
        if(btn.dataset.onedayWired) return;
        btn.dataset.onedayWired='1';
        btn.addEventListener('click',function(e){ e.preventDefault(); cloudSubmit(); });
      });
      sec.querySelectorAll('form').forEach(function(form){
        if(form.dataset.onedayMsgForm) return;
        if(!form.querySelector('#msgText')&&!form.querySelector('textarea')) return;
        form.dataset.onedayMsgForm='1';
        form.addEventListener('submit',function(e){ e.preventDefault(); cloudSubmit(); });
      });
    }

    function fmtTime(iso){
      try{
        var d=new Date(iso);
        return d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      }catch(e){ return ''; }
    }

    function warn503(kind, r){
      if(r&&r.status===503) console.warn('[OneDay] '+kind+' shared API unavailable (503). On your host, set SUPABASE_SERVICE_ROLE_KEY (server env, not public) — same as in .env.local. Photos use AWS separately.');
    }
    function loadMessages(){
      fetch('/api/event-messages/list?eventId='+encodeURIComponent(eid)+'&deviceId='+encodeURIComponent(getDeviceId())+hostQs())
        .then(function(r){ warn503('Messages', r); return r.json(); })
        .then(function(d){ renderMessages(d.messages||[]); })
        .catch(function(e){ console.warn('[OneDay] Messages list failed', e); });
    }

    function renderMessages(msgs){
      var list=findMsgList();
      if(!list) return;
      list.innerHTML='';
      if(!msgs.length){
        list.innerHTML='<p style="text-align:center;opacity:.7;font-style:italic;">No messages yet — be the first to share!</p>';
        return;
      }
      msgs.forEach(function(m){
        var div=document.createElement('div');
        div.className='onet-msg-card';
        div.style.cssText='margin:10px 0;padding:12px;border-radius:10px;border:1px solid rgba(0,0,0,.08);';
        div.setAttribute('data-msg-id', m.id);
        div.innerHTML='<div><strong>'+esc(m.author_name)+'</strong> <span style="opacity:.6;font-size:.85em;">'+esc(fmtTime(m.created_at))+'</span></div>'+
          '<div class="onet-msg-body" style="margin-top:8px;white-space:pre-wrap;">'+esc(m.body)+'</div>'+
          '<div class="onet-actions" style="margin-top:8px;display:flex;gap:8px;"></div>';
        var bodyEl=div.querySelector('.onet-msg-body');
        var actRow=div.querySelector('.onet-actions');
        if(m.owned_by_me){
          actRow.innerHTML='<button type="button" class="onet-edit">Edit</button>'+
            '<button type="button" class="onet-del">Delete</button>';
        } else {
          actRow.style.display='none';
        }
        if(m.owned_by_me) div.querySelector('.onet-edit').onclick=function(){
          var tx=document.createElement('textarea');
          tx.value=m.body;
          tx.style.cssText='width:100%;min-height:80px;margin-top:8px;';
          bodyEl.replaceWith(tx);
          var act=div.querySelector('.onet-actions');
          act.innerHTML='<button type="button" class="onet-save">Save</button> <button type="button" class="onet-can">Cancel</button>';
          div.querySelector('.onet-save').onclick=function(){
            fetch('/api/event-messages/update',{
              method:'PATCH',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify(withAdmin({eventId:eid,id:m.id,body:tx.value,authorName:m.author_name,deviceId:getDeviceId()}))
            })
            .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'update failed'); return j; }); })
            .then(function(){ loadMessages(); })
            .catch(function(err){ alert(err.message||'Save failed'); });
          };
          div.querySelector('.onet-can').onclick=function(){ loadMessages(); };
        };
        if(m.owned_by_me) div.querySelector('.onet-del').onclick=function(){
          if(!confirm('Delete this message?')) return;
          fetch('/api/event-messages/delete',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(withAdmin({eventId:eid,id:m.id,deviceId:getDeviceId()}))
          })
          .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'delete failed'); return j; }); })
          .then(function(){ loadMessages(); })
          .catch(function(err){ alert(err.message||'Delete failed'); });
        };
        list.appendChild(div);
      });
    }

    function cloudSubmit(){
      var inp=findMsgInputs();
      if(!inp.ta) return;
      var text=(inp.ta.value||'').trim();
      if(!text){ alert('Please enter a message.'); return; }
      var name=(inp.na&&inp.na.value)?inp.na.value.trim():'';
      fetch('/api/event-messages/create',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({eventId:eid,authorName:name,body:text,deviceId:getDeviceId()})
      })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'post failed'); return j; }); })
      .then(function(){
        inp.ta.value='';
        if(inp.na) inp.na.value='';
        loadMessages();
      })
      .catch(function(err){ alert(err.message||'Could not post'); });
    }

    window.submitMessage=cloudSubmit;
    window.sendMessage=cloudSubmit;
    window.addMessage=cloudSubmit;
    window.submitGuestMessage=cloudSubmit;
    window.postGuestMessage=cloudSubmit;

    ['editMsg','deleteMsg','saveMsg','cancelEdit','renderMessages','loadMessages'].forEach(function(n){
      if(typeof window[n]==='function') window[n]=function(){};
    });

    // ─── Poll — 2–12 options (#pollOpt0 … #pollOptN), shared counts ─────────────
    function pollOptionCount(){
      var max=0;
      var i;
      for(i=0;i<12;i++){
        if(document.getElementById('pollOpt'+i)) max=i+1;
      }
      if(max>=2) return max;
      var poll=document.querySelector('#poll');
      if(poll){
        var opts=poll.querySelectorAll('.poll-option');
        if(opts.length>=2) return Math.min(12,opts.length);
      }
      return 2;
    }

    function applyPollUI(counts, myChoice){
      if(!Array.isArray(counts)||!counts.length) return;
      var total=0;
      for(var t=0;t<counts.length;t++) total+=counts[t]||0;
      if(total<1) total=1;
      for(var i=0;i<counts.length;i++){
        var cnt=counts[i]||0;
        var el=document.getElementById('pollCount'+i);
        if(el) el.textContent=cnt+' vote'+(cnt!==1?'s':'');
        var bar=document.getElementById('pollBar'+i);
        if(bar) bar.style.width=Math.round((cnt/total)*100)+'%';
        var opt=document.getElementById('pollOpt'+i);
        if(opt){
          if(myChoice!==null&&myChoice!==undefined&&i===myChoice){
            opt.classList.add('voted');
          } else {
            opt.classList.remove('voted');
          }
          opt.style.cursor=(myChoice!==null&&myChoice!==undefined)?'default':'pointer';
        }
      }
      var msg=document.getElementById('pollMsg');
      if(msg&&myChoice!==null&&myChoice!==undefined){
        var labelEl=document.querySelector('#pollOpt'+myChoice+' .poll-opt-name');
        var label=labelEl?(labelEl.textContent||'').trim():'';
        msg.textContent=label?'✅ You voted: '+label:'✅ Thanks for voting!';
      }
    }

    function loadPoll(){
      var n=pollOptionCount();
      var vid=pollVoterId();
      fetch('/api/event-poll/state?eventId='+encodeURIComponent(eid)+'&voterId='+encodeURIComponent(vid)+'&optionCount='+n)
        .then(function(r){ warn503('Poll', r); return r.json(); })
        .then(function(d){
          if(Array.isArray(d.counts)) applyPollUI(d.counts, d.myChoice);
        })
        .catch(function(e){ console.warn('[OneDay] Poll state failed', e); });
    }

    window.vote=function(idx){
      var ch=Number(idx);
      var n=pollOptionCount();
      if(!Number.isInteger(ch)||ch<0||ch>=n) return;
      var vid=pollVoterId();
      fetch('/api/event-poll/vote',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({eventId:eid,voterId:vid,choice:ch,optionCount:n})
      })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'vote failed'); return j; }); })
      .then(function(d){
        var mc=d.myChoice!==undefined&&d.myChoice!==null?d.myChoice:ch;
        applyPollUI(d.counts||[], mc);
      })
      .catch(function(err){ alert(err.message||'Could not vote'); });
    };
    window.initPoll=function(){ loadPoll(); };
    window.renderPoll=function(){};

    // ─── RSVP — adults/kids + shared list ────────────────────────────────────────
    var rsvpDoneKey='onet_rsvp_done_'+eid;
    var rsvpIdKey='onet_rsvp_id_'+eid;
    var rsvpJoinEnabled=true;
    var rsvpViewerIsHost=false;

    function parsePositiveInt(v, def, min, max){
      var n=parseInt(v,10);
      if(!Number.isFinite(n)) return def;
      return Math.min(max, Math.max(min, n));
    }

    function findNameInput(sec){
      // Try explicit IDs / name attrs first
      var el=sec.querySelector(
        '#rsvpName,#guestName,#attendeeName,#yourName,#fullName,#visitorName,#personName,'+
        'input[name="guestName"],input[name="name"],input[name="fullName"],input[name="attendeeName"],input[name="yourName"],'+
        'input[id*="name" i]:not([id*="last" i]):not([id*="email" i]),'+
        'input[placeholder*="your name" i],input[placeholder*="full name" i],input[placeholder*="enter name" i],input[placeholder*="first name" i],'+
        '#name'
      );
      if(el) return el;
      // Fallback: first text input that isn't adults/kids/email/phone
      var inputs=sec.querySelectorAll('input[type="text"],input:not([type])');
      for(var i=0;i<inputs.length;i++){
        var inp=inputs[i];
        var id=(inp.id||'').toLowerCase();
        var nm=(inp.name||'').toLowerCase();
        var ph=(inp.placeholder||'').toLowerCase();
        if(id.indexOf('adult')>-1||id.indexOf('kid')>-1||id.indexOf('child')>-1||id.indexOf('email')>-1||id.indexOf('phone')>-1) continue;
        if(nm.indexOf('adult')>-1||nm.indexOf('kid')>-1||nm.indexOf('child')>-1||nm.indexOf('email')>-1||nm.indexOf('phone')>-1) continue;
        if(ph.indexOf('adult')>-1||ph.indexOf('kid')>-1||ph.indexOf('child')>-1||ph.indexOf('email')>-1||ph.indexOf('phone')>-1) continue;
        return inp;
      }
      return null;
    }

    function readRsvpInputs(sec){
      if(!sec) return {name:'Guest',adults:1,kids:0};
      var nameIn=findNameInput(sec);
      var aIn=sec.querySelector('#adults,#rsvpAdults,#adultCount,#numAdults,input[name="adults"],input[name="adultCount"],input[id*="adult" i]');
      var kIn=sec.querySelector('#kids,#rsvpKids,#kidCount,#numKids,#children,input[name="kids"],input[name="children"],input[name="kidCount"],input[id*="kid" i],input[id*="child" i]');
      var name=nameIn&&nameIn.value?nameIn.value.trim():'';
      if(!name) name='Guest';
      var adults=aIn?parsePositiveInt(aIn.value,1,1,100):1;
      var kids=kIn?parsePositiveInt(kIn.value,0,0,100):0;
      return {name:name,adults:adults,kids:kids};
    }

    function wireRsvpActions(){
      var sec=document.querySelector('#rsvp')||document.querySelector('[id*="rsvp"]');
      if(!sec) return;
      // Prefer form submit interception when a form exists.
      sec.querySelectorAll('form').forEach(function(form){
        if(form.dataset.onedayRsvpForm) return;
        if(!form.querySelector('input,button')) return;
        form.dataset.onedayRsvpForm='1';
        form.addEventListener('submit', function(e){
          e.preventDefault();
          cloudHandleRSVP();
        });
      });
      // Also wire generic RSVP buttons by id/class/text in case template has no <form>.
      sec.querySelectorAll('button').forEach(function(btn){
        if(btn.dataset.onedayRsvpBtn) return;
        var id=(btn.id||'').toLowerCase();
        var cls=(btn.className||'').toLowerCase();
        var tx=(btn.textContent||'').trim().toLowerCase();
        if(
          id==='onedayrsvpvisibilitytoggle'||
          id==='onedayrsvpjointoggle'||
          id==='onedayrsvpqrbutton'
        ) return;
        var isRsvpBtn = id==='rsvpbtn' || id.indexOf('rsvp')!==-1 || cls.indexOf('rsvp')!==-1 || tx.indexOf('rsvp')!==-1;
        if(!isRsvpBtn) return;
        btn.dataset.onedayRsvpBtn='1';
        btn.addEventListener('click', function(e){
          e.preventDefault();
          cloudHandleRSVP();
        });
      });
    }

    function writeRsvpInputs(sec, row){
      if(!sec||!row) return;
      var nameIn=findNameInput(sec);
      var aIn=sec.querySelector('#adults,#rsvpAdults,#adultCount,#numAdults,input[name="adults"],input[name="adultCount"],input[id*="adult" i]');
      var kIn=sec.querySelector('#kids,#rsvpKids,#kidCount,#numKids,#children,input[name="kids"],input[name="children"],input[name="kidCount"],input[id*="kid" i],input[id*="child" i]');
      if(nameIn) nameIn.value=row.guest_name||'Guest';
      if(aIn) aIn.value=String(row.adults||1);
      if(kIn) kIn.value=String(row.kids||0);
    }

    function ensureRsvpListHost(sec){
      var el=document.getElementById('rsvpList');
      if(el) return el;
      if(!sec) return null;
      el=document.createElement('div');
      el.id='rsvpList';
      el.setAttribute('data-oneday-rsvp-list','1');
      el.style.cssText='margin-top:16px;font-size:0.9rem;max-height:220px;overflow:auto;text-align:left;';
      var btn=sec.querySelector('#rsvpBtn');
      if(btn&&btn.parentNode) btn.parentNode.insertBefore(el, btn.nextSibling);
      else sec.appendChild(el);
      return el;
    }

    function ensureRsvpVisibilityToggle(sec){
      if(!sec) return null;
      var el=document.getElementById('onedayRsvpVisibilityToggle');
      if(el) return el;
      el=document.createElement('button');
      el.type='button';
      el.id='onedayRsvpVisibilityToggle';
      el.style.cssText='margin-top:10px;font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:transparent;cursor:pointer;';
      var btn=sec.querySelector('#rsvpBtn');
      if(btn&&btn.parentNode) btn.parentNode.insertBefore(el, btn.nextSibling);
      else sec.appendChild(el);
      return el;
    }

    function ensureRsvpJoinToggle(sec){
      if(!sec) return null;
      var el=document.getElementById('onedayRsvpJoinToggle');
      if(el) return el;
      el=document.createElement('button');
      el.type='button';
      el.id='onedayRsvpJoinToggle';
      el.style.cssText='margin-top:10px;margin-left:8px;font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:transparent;cursor:pointer;';
      var btn=sec.querySelector('#rsvpBtn');
      if(btn&&btn.parentNode) btn.parentNode.insertBefore(el, btn.nextSibling);
      else sec.appendChild(el);
      return el;
    }

    function publicJoinUrl(){
      var base=(window.location.origin||'').replace(/\\/+$/,'');
      return base+'/e/'+encodeURIComponent(eid);
    }

    function ensureRsvpQrButton(sec){
      if(!sec) return null;
      var el=document.getElementById('onedayRsvpQrButton');
      if(el) return el;
      el=document.createElement('button');
      el.type='button';
      el.id='onedayRsvpQrButton';
      el.style.cssText='margin-top:10px;margin-left:8px;font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:transparent;cursor:pointer;';
      var btn=sec.querySelector('#rsvpBtn');
      if(btn&&btn.parentNode) btn.parentNode.insertBefore(el, btn.nextSibling);
      else sec.appendChild(el);
      return el;
    }

    function ensureRsvpQrModal(){
      var modal=document.getElementById('onedayRsvpQrModal');
      if(modal) return modal;
      modal=document.createElement('div');
      modal.id='onedayRsvpQrModal';
      modal.style.cssText='position:fixed;inset:0;background:rgba(8,10,16,.68);z-index:2147483646;display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;';
      modal.innerHTML=
        '<div style="width:min(92vw,420px);background:#fff;color:#111;border-radius:14px;padding:16px;box-shadow:0 16px 40px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'+
            '<strong style="font-size:16px;">Guest QR Join</strong>'+
            '<button type="button" id="onedayRsvpQrClose" style="border:none;background:transparent;font-size:24px;line-height:1;cursor:pointer;">&times;</button>'+
          '</div>'+
          '<p style="margin:8px 0 10px;font-size:13px;color:#444;">Print and place this at your venue so guests can scan and RSVP instantly.</p>'+
          '<div style="display:flex;justify-content:center;margin:8px 0 12px;">'+
            '<img id="onedayRsvpQrImage" alt="Event RSVP QR code" style="width:300px;height:300px;max-width:100%;border-radius:10px;border:1px solid rgba(0,0,0,.12);" />'+
          '</div>'+
          '<div style="font-size:12px;color:#555;margin-bottom:4px;">Join link</div>'+
          '<input id="onedayRsvpQrLink" type="text" readonly style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(0,0,0,.2);font-size:12px;box-sizing:border-box;" />'+
          '<div style="font-size:12px;color:#555;margin-top:8px;">Event code: <span id="onedayRsvpQrCode"></span></div>'+
          '<div id="onedayRsvpQrState" style="display:none;margin-top:8px;font-size:12px;padding:8px 10px;border-radius:8px;border:1px solid rgba(220,38,38,.28);background:rgba(220,38,38,.08);color:#991b1b;">Joining is currently paused. Guests can view the event page, but new RSVPs are disabled.</div>'+
          '<div style="display:flex;gap:8px;margin-top:12px;">'+
            '<button type="button" id="onedayRsvpQrCopy" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:#fff;cursor:pointer;">Copy link</button>'+
            '<button type="button" id="onedayRsvpQrPrint" style="flex:1;padding:10px 12px;border-radius:8px;border:none;background:#111;color:#fff;cursor:pointer;">Print</button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(modal);

      var closeBtn=modal.querySelector('#onedayRsvpQrClose');
      if(closeBtn) closeBtn.onclick=function(){ modal.style.display='none'; };
      modal.addEventListener('click', function(ev){
        if(ev.target===modal) modal.style.display='none';
      });

      var copyBtn=modal.querySelector('#onedayRsvpQrCopy');
      if(copyBtn) copyBtn.onclick=function(){
        var inp=modal.querySelector('#onedayRsvpQrLink');
        if(!inp) return;
        var txt=String(inp.value||'');
        if(!txt) return;
        if(navigator.clipboard&&navigator.clipboard.writeText){
          navigator.clipboard.writeText(txt).then(function(){
            copyBtn.textContent='Copied';
            setTimeout(function(){ copyBtn.textContent='Copy link'; }, 1400);
          }).catch(function(){});
        } else {
          inp.focus();
          inp.select();
          try{ document.execCommand('copy'); }catch(e){}
        }
      };

      var printBtn=modal.querySelector('#onedayRsvpQrPrint');
      if(printBtn) printBtn.onclick=function(){ window.print(); };
      return modal;
    }

    function openRsvpQrModal(){
      var modal=ensureRsvpQrModal();
      if(!modal) return;
      var joinUrl=publicJoinUrl();
      var qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=24&data='+encodeURIComponent(joinUrl);
      var img=modal.querySelector('#onedayRsvpQrImage');
      var inp=modal.querySelector('#onedayRsvpQrLink');
      var code=modal.querySelector('#onedayRsvpQrCode');
      var state=modal.querySelector('#onedayRsvpQrState');
      if(img) img.src=qrUrl;
      if(inp) inp.value=joinUrl;
      if(code) code.textContent=eid;
      if(state){
        state.style.display=rsvpJoinEnabled?'none':'block';
      }
      modal.style.display='flex';
    }

    function syncRsvpQrButton(sec, isHost){
      var btn=ensureRsvpQrButton(sec);
      if(!btn) return;
      if(!isHost){
        btn.style.display='none';
        btn.onclick=null;
        return;
      }
      btn.style.display='inline-block';
      btn.textContent='📱 Guest QR';
      btn.onclick=openRsvpQrModal;
    }

    function syncRsvpJoinToggle(sec, isHost, joinEnabled){
      var tg=ensureRsvpJoinToggle(sec);
      if(!tg) return;
      if(!isHost){
        tg.style.display='none';
        tg.onclick=null;
        return;
      }
      tg.style.display='inline-block';
      tg.textContent=joinEnabled?'⛔ Pause new RSVPs':'✅ Resume new RSVPs';
      tg.onclick=function(){
        fetch('/api/event-rsvps/join-toggle',{
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(withAdmin({eventId:eid,enabled:!joinEnabled,deviceId:getDeviceId()}))
        })
        .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'update failed'); return j; }); })
        .then(function(){ loadRsvps(); })
        .catch(function(err){ alert(err.message||'Could not update RSVP joining'); });
      };
    }

    function invitePanelAnchor(sec){
      return sec||document.querySelector('main')||document.querySelector('article')||document.body;
    }

    function ensureInviteEmailPanel(sec){
      var anchor=invitePanelAnchor(sec);
      var el=document.getElementById('onedayInvitePanel');
      if(el){
        if(anchor&&el.parentNode!==anchor) anchor.appendChild(el);
        return el;
      }
      el=document.createElement('div');
      el.id='onedayInvitePanel';
      el.setAttribute('data-oneday-invite','1');
      el.style.cssText='display:none;margin-top:18px;padding:14px;border-radius:10px;border:1px solid rgba(0,0,0,.12);text-align:left;max-width:100%;box-sizing:border-box;';
      el.innerHTML='<div style="font-weight:600;margin-bottom:6px;font-size:14px;">Email invitations</div>'+
        '<p style="font-size:12px;opacity:.82;margin:0 0 10px;line-height:1.45;">Add guest emails (comma, space, or line break between addresses). Each guest gets a private email with a link to this page.</p>'+
        '<textarea id="onetInviteEmails" rows="4" placeholder="alex@example.com, jamie@example.com" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(0,0,0,.2);font-size:13px;resize:vertical;"></textarea>'+
        '<button type="button" id="onetInviteSend" style="margin-top:10px;padding:8px 16px;border-radius:8px;border:none;background:#111;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Send invitations</button>'+
        '<div id="onetInviteStatus" style="margin-top:10px;font-size:12px;line-height:1.45;"></div>';
      anchor.appendChild(el);
      var sendBtn=el.querySelector('#onetInviteSend');
      var statusEl=el.querySelector('#onetInviteStatus');
      var ta=el.querySelector('#onetInviteEmails');
      sendBtn.onclick=function(){
        if(!statusEl||!ta)return;
        var raw=ta.value||'';
        var parts=raw.replace(/[,;]+/g,' ').split(/\\s+/).filter(Boolean);
        var emails=[];
        var seen={};
        var re=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/i;
        parts.forEach(function(p){
          var e=p.toLowerCase();
          if(!re.test(e)||e.length>254)return;
          if(seen[e])return;
          seen[e]=1;
          emails.push(e);
          if(emails.length>=25)return;
        });
        if(!emails.length){
          statusEl.textContent='Enter at least one valid email.';
          statusEl.style.color='#b45309';
          return;
        }
        statusEl.textContent='Sending…';
        statusEl.style.color='#444';
        sendBtn.disabled=true;
        fetch('/api/event-invites/send',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(withAdmin({eventId:eid,emails:emails,deviceId:getDeviceId()}))
        })
        .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
        .then(function(x){
          sendBtn.disabled=false;
          if(!x.ok){
            statusEl.textContent=(x.j&&x.j.error)?x.j.error:'Could not send.';
            statusEl.style.color='#b91c1c';
            return;
          }
          var j=x.j;
          var line='';
          if(typeof j.sent==='number'&&j.sent>0) line+='Sent '+j.sent+'. ';
          if(j.failed&&j.failed.length) line+=j.failed.length+' failed.';
          statusEl.textContent=line.trim()||'Done.';
          statusEl.style.color=(j.failed&&j.failed.length)?'#b45309':'#15803d';
          if(j.sent) ta.value='';
        })
        .catch(function(){
          sendBtn.disabled=false;
          statusEl.textContent='Network error.';
          statusEl.style.color='#b91c1c';
        });
      };
      return el;
    }

    function syncInviteEmailPanel(sec,isHost){
      var el=ensureInviteEmailPanel(sec);
      if(!el)return;
      if(!isHost){
        el.style.display='none';
        return;
      }
      el.style.display='block';
    }

    function syncRsvpVisibilityToggle(sec, isHost, guestListHidden){
      var tg=ensureRsvpVisibilityToggle(sec);
      if(!tg) return;
      if(!isHost){
        tg.style.display='none';
        tg.onclick=null;
        return;
      }
      tg.style.display='inline-block';
      tg.textContent=guestListHidden?'👁️ Show guest list to guests':'🙈 Hide guest list from guests';
      tg.onclick=function(){
        fetch('/api/event-rsvps/visibility',{
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(withAdmin({eventId:eid,hidden:!guestListHidden,deviceId:getDeviceId()}))
        })
        .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'update failed'); return j; }); })
        .then(function(){ loadRsvps(); })
        .catch(function(err){ alert(err.message||'Could not update guest-list visibility'); });
      };
    }

    function renderRsvpList(rsvps, isHost, guestListHidden){
      var sec=document.querySelector('#rsvp')||document.querySelector('[id*="rsvp"]');
      var host=ensureRsvpListHost(sec);
      if(!host) return;
      if(guestListHidden && !isHost){
        host.style.display='block';
        host.innerHTML="<div style='opacity:.78;font-size:0.88rem;'>Guest list is hidden by the host.</div>";
        return;
      }
      if(!rsvps||!rsvps.length){
        host.innerHTML='';
        host.style.display='none';
        return;
      }
      host.style.display='block';
      host.innerHTML="<div style='font-weight:600;margin-bottom:8px;'>Who's coming</div>"+rsvps.map(function(r){
        var ad=r.adults||1, kd=r.kids||0;
        var bits=[];
        bits.push(ad+' adult'+(ad!==1?'s':''));
        if(kd) bits.push(kd+' kid'+(kd!==1?'s':''));
        var row='<div style="padding:6px 0;border-bottom:1px solid rgba(0,0,0,.08);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;"><span>'+esc(r.guest_name||'Guest')+' — '+bits.join(', ')+'</span>';
        if(isHost) row+='<button type="button" class="onet-rsvp-del" data-rid="'+esc(r.id)+'" style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid rgba(0,0,0,.15);background:transparent;cursor:pointer;">Remove</button>';
        return row+'</div>';
      }).join('');
      if(isHost){
        host.querySelectorAll('.onet-rsvp-del').forEach(function(btn){
          btn.onclick=function(){
            var rid=btn.getAttribute('data-rid');
            if(!rid||!confirm('Remove this RSVP?')) return;
            fetch('/api/event-rsvps/delete',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify(withAdmin({eventId:eid,id:rid,deviceId:getDeviceId()}))
            })
            .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'delete failed'); return j; }); })
            .then(function(){ loadRsvps(); })
            .catch(function(err){ alert(err.message||'Could not remove'); });
          };
        });
      }
    }

    /** Called on page load and before RSVP submit — hides any confirmation UI that Claude may have left visible by default. */
    function hideRsvpFalseSuccessUI(){
      document.querySelectorAll(
        '#rsvpThanks,#rsvpThankYou,#rsvpSuccess,#rsvpThank,#rsvpConfirmation,#rsvpConfirm,#rsvpConfirmed,'+
        '[id*="rsvpThank"],[id*="RsvpThank"],[id*="rsvpConfirm"],[id*="rsvpSuccess"],[id*="rsvpDone"],[id*="rsvp-confirm"],[id*="rsvp-success"],[id*="rsvp-thank"],'+
        '[data-rsvp-thanks],[data-rsvp-success],'+
        '[class*="rsvp-success"],[class*="rsvp-thank"],[class*="rsvp-confirm"],[class*="rsvp-done"],[class*="rsvp-confirmed"]'
      ).forEach(function(el){
        el.style.display='none';
        el.setAttribute('hidden','');
      });
      var sec=document.querySelector('#rsvp')||document.querySelector('section[id*="rsvp"]')||document.querySelector('[id*="rsvp"]');
      if(sec){
        sec.querySelectorAll('p,div,span,aside,h2,h3,section').forEach(function(el){
          // Skip if it contains form inputs — that's the RSVP form itself
          if(el.querySelector&&el.querySelector('input,button,textarea,select,form')) return;
          // Skip the RSVP count element
          if(el.id==='rsvpCount'||el.id==='rsvp-count') return;
          var t=(el.textContent||'').trim();
          if(t.length>8&&t.length<300&&(
            /rsvp.*received|thank you.*rsvp|your rsvp has been|you('re| are) (on the list|confirmed|registered|all set)|see you (at|there|soon)|we('ll| will) see you|you('ve| have) rsvp|rsvp.*confirmed|confirmed.*rsvp|we got your|your spot is/i.test(t)
          )){
            el.style.display='none';
            el.setAttribute('hidden','');
          }
        });
      }
    }

    function dedupeRsvpForms(){
      var sec=document.querySelector('#rsvp')||document.querySelector('[id*="rsvp"]');
      if(!sec) return;
      var actionBtns=Array.prototype.slice.call(sec.querySelectorAll('button')).filter(function(btn){
        if(!btn||!btn.textContent) return false;
        var id=(btn.id||'').toLowerCase();
        if(id==='onedayrsvpvisibilitytoggle'||id==='onedayrsvpjointoggle'||id==='onedayrsvpqrbutton') return false;
        return /rsvp/i.test(btn.textContent);
      });
      if(actionBtns.length<=1) return;
      var canonical=actionBtns.find(function(btn){ return btn.id==='rsvpBtn'; })||actionBtns[actionBtns.length-1];
      actionBtns.forEach(function(btn){
        if(btn===canonical) return;
        var container=btn.closest('form')||btn.parentElement;
        if(!container||container===sec) return;
        // Hide the extra RSVP block generated in some HTML variants.
        container.style.display='none';
        container.setAttribute('data-oneday-hidden-dup-rsvp','1');
      });
    }

    function loadRsvps(){
      dedupeRsvpForms();
      wireRsvpActions();
      hideRsvpFalseSuccessUI();
      fetch('/api/event-rsvps/list?eventId='+encodeURIComponent(eid)+'&deviceId='+encodeURIComponent(getDeviceId())+hostQs())
        .then(function(r){ warn503('RSVP', r); return r.json(); })
        .then(function(d){
          var totalAd=d.totalAdults||0;
          var totalKd=d.totalKids||0;
          var head=totalAd+totalKd;
          var countEl=document.getElementById('rsvpCount');
          if(countEl) countEl.textContent=String(head);
          var sec=document.querySelector('#rsvp')||document.querySelector('[id*="rsvp"]');
          var btn=document.getElementById('rsvpBtn');
          var note=document.getElementById('rsvpNote');
          var all=d.rsvps||[];
          var isHost=!!d.is_host;
          var guestListHidden=!!d.guest_list_hidden;
          var joinEnabled=d.rsvp_join_enabled!==false;
          rsvpJoinEnabled=joinEnabled;
          rsvpViewerIsHost=isHost;
          renderRsvpList(all, isHost, guestListHidden);
          syncRsvpVisibilityToggle(sec, isHost, guestListHidden);
          syncRsvpQrButton(sec, isHost);
          syncRsvpJoinToggle(sec, isHost, joinEnabled);
          syncInviteEmailPanel(sec, isHost);

          if(btn && !isHost && !joinEnabled){
            btn.textContent='RSVP Closed';
            btn.disabled=true;
            btn.classList.add('rsvp-gone');
          }

          var localId=localStorage.getItem(rsvpIdKey)||'';
          var mine=null;
          if(localId){
            mine=all.find(function(r){ return String(r.id)===String(localId); })||null;
            if(!mine){
              localStorage.removeItem(rsvpIdKey);
              localStorage.removeItem(rsvpDoneKey);
              localId='';
            } else if(!mine.owned_by_me){
              localStorage.removeItem(rsvpIdKey);
              localStorage.removeItem(rsvpDoneKey);
              localId='';
              mine=null;
            } else {
              writeRsvpInputs(sec, mine);
            }
          }
          if(!mine){
            mine=all.find(function(r){ return r.owned_by_me; })||null;
            if(mine&&mine.id){ localStorage.setItem(rsvpIdKey, String(mine.id)); localStorage.setItem(rsvpDoneKey,'1'); localId=String(mine.id); writeRsvpInputs(sec, mine); }
          }

          if(localId&&mine){
            if(btn){
              btn.textContent='✏️ Update RSVP';
              btn.disabled=false;
              btn.classList.remove('rsvp-gone');
            }
            if(note) note.textContent='You can edit your RSVP from this device.';
          } else if(localStorage.getItem(rsvpDoneKey)==='1'){
            var stillMine=all.find(function(r){ return r.owned_by_me; })||null;
            if(!stillMine){
              localStorage.removeItem(rsvpDoneKey);
              if(btn){
                btn.textContent=btn.getAttribute('data-oneday-rsvp-label')||'RSVP';
                if(!isHost&&!joinEnabled){
                  btn.textContent='RSVP Closed';
                  btn.disabled=true;
                  btn.classList.add('rsvp-gone');
                } else {
                  btn.disabled=false;
                  btn.classList.remove('rsvp-gone');
                }
              }
              if(note) note.textContent=(!isHost&&!joinEnabled)
                ? 'RSVP is currently closed by the host.'
                : 'Guests can RSVP from any device — totals update live.';
            }
            else {
              if(!localId&&stillMine.id){
                localId=String(stillMine.id);
                localStorage.setItem(rsvpIdKey, localId);
              }
              writeRsvpInputs(sec, stillMine);
              if(btn){
                btn.textContent='✏️ Update RSVP';
                btn.disabled=false;
                btn.classList.remove('rsvp-gone');
              }
              if(note) note.textContent='You can edit your RSVP from this device.';
            }
          } else if(note){
            note.textContent=(!isHost&&!joinEnabled)
              ? 'RSVP is currently closed by the host.'
              : 'Guests can RSVP from any device — totals update live.';
          }
          if(d.is_host){
            var noteH=document.getElementById('rsvpNote');
            if(noteH) noteH.textContent=guestListHidden
              ? (joinEnabled
                ? 'Host mode — guest list is hidden for visitors.'
                : 'Host mode — guest list hidden and new RSVP joining is paused.')
              : (joinEnabled
                ? 'Host mode — you can remove RSVPs from the list below.'
                : 'Host mode — new RSVP joining is paused.');
          } else if(guestListHidden){
            var noteG=document.getElementById('rsvpNote');
            if(noteG) noteG.textContent='The host has hidden the guest list.';
          }
        })
        .catch(function(e){ console.warn('[OneDay] RSVP list failed', e); });
    }

    function cloudHandleRSVP(){
      if(!rsvpJoinEnabled&&!rsvpViewerIsHost){
        hideRsvpFalseSuccessUI();
        alert('RSVP is currently closed by the host.');
        return;
      }
      var localId=localStorage.getItem(rsvpIdKey)||'';
      hideRsvpFalseSuccessUI();
      var sec=document.querySelector('#rsvp')||document.querySelector('[id*="rsvp"]');
      var inp=readRsvpInputs(sec);
      var isUpdate=!!localId;
      var route=isUpdate?'/api/event-rsvps/update':'/api/event-rsvps/create';
      var method=isUpdate?'PATCH':'POST';
      var body={eventId:eid,guestName:inp.name,adults:inp.adults,kids:inp.kids,deviceId:getDeviceId()};
      if(isUpdate) body.id=localId;
      withAdmin(body);

      function applyRsvpSuccess(j, wasUpdate){
        localStorage.setItem(rsvpDoneKey,'1');
        if(j&&j.rsvp&&j.rsvp.id) localStorage.setItem(rsvpIdKey, String(j.rsvp.id));
        var btn=document.getElementById('rsvpBtn');
        if(btn){
          btn.textContent='✏️ Update RSVP';
          btn.disabled=false;
          btn.classList.remove('rsvp-gone');
        }
        var note=document.getElementById('rsvpNote');
        if(note) note.textContent=wasUpdate?'Your RSVP was updated.':'Thanks! You can edit this RSVP from this device.';
        loadRsvps();
      }

      fetch(route,{
        method:method,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      })
      .then(function(r){
        return r.json().then(function(j){
          if(!r.ok){
            var e=new Error(j.error||'RSVP failed');
            e.code=j.code;
            e.existingId=j.existingId;
            throw e;
          }
          return j;
        });
      })
      .then(function(j){ applyRsvpSuccess(j, isUpdate); })
      .catch(function(err){
        if(err&&err.code==='RSVP_EXISTS'&&err.existingId&&!isUpdate){
          localStorage.setItem(rsvpIdKey, String(err.existingId));
          localStorage.setItem(rsvpDoneKey,'1');
          return fetch('/api/event-rsvps/update',{
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(withAdmin({eventId:eid,id:String(err.existingId),guestName:inp.name,adults:inp.adults,kids:inp.kids,deviceId:getDeviceId()}))
          }).then(function(r2){
            return r2.json().then(function(j2){
              if(!r2.ok){
                var e2=new Error(j2.error||'RSVP failed');
                e2.code=j2.code;
                throw e2;
              }
              return j2;
            });
          }).then(function(j2){ applyRsvpSuccess(j2, true); })
          .catch(function(e2){
            if(localId&&/not found/i.test(String(e2&&e2.message||''))){
              localStorage.removeItem(rsvpIdKey);
              localStorage.removeItem(rsvpDoneKey);
            }
            hideRsvpFalseSuccessUI();
            alert(e2.message||'Could not RSVP');
          });
        }
        if(localId&&/not found/i.test(String(err&&err.message||''))){
          localStorage.removeItem(rsvpIdKey);
          localStorage.removeItem(rsvpDoneKey);
        }
        hideRsvpFalseSuccessUI();
        alert(err.message||'Could not RSVP');
      });
    }

    window.handleRSVP=cloudHandleRSVP;
    window.initRSVP=function(){ loadRsvps(); };

    loadMessages();
    wireMessageButtons();
    setTimeout(wireMessageButtons,120);
    setTimeout(wireMessageButtons,600);
    loadPoll();
    loadRsvps();
    wireRsvpActions();

    setInterval(function(){
      loadMessages();
      wireMessageButtons();
      loadPoll();
      loadRsvps();
    }, 20000);
  }

  function boot(){
    setTimeout(run, 0);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
<\/script>`;
