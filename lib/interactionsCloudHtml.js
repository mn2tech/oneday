/**
 * Injected before </body> when SUPABASE_SERVICE_ROLE_KEY is set.
 * Shared Supabase-backed: messages, poll (2–12 options via #pollOpt0…), RSVP with adults/kids + list — same for all guests.
 *
 * Lives under /lib (not /pages) so Next.js does not treat this file as a route.
 */
export const INTERACTIONS_CLOUD = `<script>
(function(){
  function run(){
    var eid = (window.__ONEDAY_EID__ || window.location.pathname.split('/').pop() || 'event').slice(0,80);

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

    function findMsgList(){
      var ta=document.querySelector('#msgText');
      if(ta){
        var sec=ta.closest('section');
        if(sec){
          var scoped=sec.querySelector('#msgList, #messageList, #msg-list, [class*="message-list"]');
          if(scoped) return scoped;
        }
      }
      return document.querySelector('#msgList, #messageList, #msg-list');
    }
    function findMsgInputs(){
      var ta=document.querySelector('#msgText')||document.querySelector('textarea[id*="msg"]');
      var na=document.querySelector('#msgName')||document.querySelector('input[id*="name"][type="text"], input[name="name"]');
      return {ta:ta, na:na};
    }

    function fmtTime(iso){
      try{
        var d=new Date(iso);
        return d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      }catch(e){ return ''; }
    }

    function loadMessages(){
      fetch('/api/event-messages/list?eventId='+encodeURIComponent(eid))
        .then(function(r){ return r.json(); })
        .then(function(d){ renderMessages(d.messages||[]); })
        .catch(function(){});
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
          '<div class="onet-actions" style="margin-top:8px;display:flex;gap:8px;">'+
          '<button type="button" class="onet-edit">Edit</button>'+
          '<button type="button" class="onet-del">Delete</button></div>';
        var bodyEl=div.querySelector('.onet-msg-body');
        div.querySelector('.onet-edit').onclick=function(){
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
              body:JSON.stringify({eventId:eid,id:m.id,body:tx.value,authorName:m.author_name})
            })
            .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'update failed'); return j; }); })
            .then(function(){ loadMessages(); })
            .catch(function(err){ alert(err.message||'Save failed'); });
          };
          div.querySelector('.onet-can').onclick=function(){ loadMessages(); };
        };
        div.querySelector('.onet-del').onclick=function(){
          if(!confirm('Delete this message?')) return;
          fetch('/api/event-messages/delete',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({eventId:eid,id:m.id})
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
        body:JSON.stringify({eventId:eid,authorName:name,body:text})
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
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(Array.isArray(d.counts)) applyPollUI(d.counts, d.myChoice);
        })
        .catch(function(){});
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

    function parsePositiveInt(v, def, min, max){
      var n=parseInt(v,10);
      if(!Number.isFinite(n)) return def;
      return Math.min(max, Math.max(min, n));
    }

    function readRsvpInputs(sec){
      if(!sec) return {name:'Guest',adults:1,kids:0};
      var nameIn=sec.querySelector('#rsvpName,#guestName,#name,input[name="guestName"]');
      var aIn=sec.querySelector('#adults,#rsvpAdults,input[name="adults"]');
      var kIn=sec.querySelector('#kids,#rsvpKids,input[name="kids"]');
      var name=nameIn&&nameIn.value?nameIn.value.trim():'';
      if(!name) name='Guest';
      var adults=aIn?parsePositiveInt(aIn.value,1,1,100):1;
      var kids=kIn?parsePositiveInt(kIn.value,0,0,100):0;
      return {name:name,adults:adults,kids:kids};
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

    function renderRsvpList(rsvps){
      var sec=document.querySelector('#rsvp')||document.querySelector('[id*="rsvp"]');
      var host=ensureRsvpListHost(sec);
      if(!host) return;
      if(!rsvps||!rsvps.length){
        host.innerHTML='';
        host.style.display='none';
        return;
      }
      host.style.display='block';
      host.innerHTML="<div style=\"font-weight:600;margin-bottom:8px;\">Who's coming</div>"+rsvps.map(function(r){
        var ad=r.adults||1, kd=r.kids||0;
        var bits=[];
        bits.push(ad+' adult'+(ad!==1?'s':''));
        if(kd) bits.push(kd+' kid'+(kd!==1?'s':''));
        return '<div style="padding:6px 0;border-bottom:1px solid rgba(0,0,0,.08);">'+esc(r.guest_name||'Guest')+' — '+bits.join(', ')+'</div>';
      }).join('');
    }

    function loadRsvps(){
      fetch('/api/event-rsvps/list?eventId='+encodeURIComponent(eid))
        .then(function(r){ return r.json(); })
        .then(function(d){
          var totalAd=d.totalAdults||0;
          var totalKd=d.totalKids||0;
          var head=totalAd+totalKd;
          var countEl=document.getElementById('rsvpCount');
          if(countEl) countEl.textContent=String(head);
          var btn=document.getElementById('rsvpBtn');
          var note=document.getElementById('rsvpNote');
          renderRsvpList(d.rsvps||[]);
          if(localStorage.getItem(rsvpDoneKey)==='1'){
            if(btn){
              btn.textContent="✅ You're on the list!";
              btn.disabled=true;
              btn.classList.add('rsvp-gone');
            }
            if(note) note.textContent='Thanks! See you there.';
          } else if(note){
            note.textContent='Guests can RSVP from any device — totals update live.';
          }
        })
        .catch(function(){});
    }

    function cloudHandleRSVP(){
      if(localStorage.getItem(rsvpDoneKey)==='1'){
        alert('You already RSVP’d from this device.');
        return;
      }
      var sec=document.querySelector('#rsvp')||document.querySelector('[id*="rsvp"]');
      var inp=readRsvpInputs(sec);
      fetch('/api/event-rsvps/create',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({eventId:eid,guestName:inp.name,adults:inp.adults,kids:inp.kids})
      })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'RSVP failed'); return j; }); })
      .then(function(){
        localStorage.setItem(rsvpDoneKey,'1');
        var btn=document.getElementById('rsvpBtn');
        if(btn){
          btn.textContent="✅ You're on the list!";
          btn.disabled=true;
          btn.classList.add('rsvp-gone');
        }
        var note=document.getElementById('rsvpNote');
        if(note) note.textContent='Thanks! See you there.';
        loadRsvps();
      })
      .catch(function(err){ alert(err.message||'Could not RSVP'); });
    }

    window.handleRSVP=cloudHandleRSVP;
    window.initRSVP=function(){ loadRsvps(); };

    loadMessages();
    loadPoll();
    loadRsvps();

    setInterval(function(){
      loadMessages();
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
