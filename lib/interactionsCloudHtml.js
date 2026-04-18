/**
 * Injected before </body> when SUPABASE_SERVICE_ROLE_KEY is set.
 * Replaces local-only RSVP, message wall + poll with shared Supabase-backed APIs.
 *
 * Lives under /lib (not /pages) so Next.js does not treat this file as a route.
 */
export const INTERACTIONS_CLOUD = `<script>
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      var eid = (window.__ONEDAY_EID__ || window.location.pathname.split('/').pop() || 'event').slice(0,80);

      function esc(t){
        return String(t == null ? '' : t)
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      function pollVoterId(){
        var k='oneday_poll_voter_'+eid;
        try{
          var v=localStorage.getItem(k);
          if(v) return v;
          v=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():('v'+Math.random().toString(36).slice(2)+Date.now());
          localStorage.setItem(k,v);
          return v;
        }catch(e){ return 'v'+Math.random().toString(36).slice(2); }
      }

      function renderPollBars(counts, myChoice){
        var poll=document.querySelector('section#poll, #poll, [id="poll"]');
        if(!poll) return;
        var c0=counts[0]||0, c1=counts[1]||0;
        var total=c0+c1;
        var t=total>0?total:1;
        var p0=Math.round((c0/t)*100);
        var p1=Math.round((c1/t)*100);
        var bars=poll.querySelectorAll('.poll-option .poll-bar');
        if(bars.length<2) bars=poll.querySelectorAll('.poll-bar');
        if(bars.length<2) bars=poll.querySelectorAll('[id^="bar"], [id^="pollBar"]');
        if(bars.length>=2){
          bars[0].style.width=p0+'%';
          bars[1].style.width=p1+'%';
        }
        var pcts=poll.querySelectorAll('[id*="pct"], [id*="Pct"], .poll-pct');
        if(pcts.length>=2){
          pcts[0].textContent=p0+'%';
          pcts[1].textContent=p1+'%';
        }
        var countsEl=poll.querySelector('#pollTotal, #pollMsg, .poll-total');
        if(countsEl) countsEl.textContent=total+' vote'+(total!==1?'s':'')+' cast';
        var opts=poll.querySelectorAll('.poll-option');
        for(var j=0;j<opts.length&&j<2;j++){
          opts[j].classList.toggle('selected', myChoice!==null && myChoice===j);
          opts[j].classList.toggle('voted', myChoice!==null);
        }
      }

      function loadPoll(){
        var vid=pollVoterId();
        fetch('/api/event-poll/state?eventId='+encodeURIComponent(eid)+'&voterId='+encodeURIComponent(vid))
          .then(function(r){ return r.json(); })
          .then(function(d){
            var c=d.counts||[0,0];
            renderPollBars(c, d.myChoice);
          })
          .catch(function(){});
      }

      function postVote(choice){
        var vid=pollVoterId();
        fetch('/api/event-poll/vote',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({eventId:eid,voterId:vid,choice:choice})
        })
        .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'vote failed'); return j; }); })
        .then(function(d){
          renderPollBars(d.counts||[0,0], d.myChoice);
        })
        .catch(function(err){ alert(err.message||'Could not vote'); });
      }

      window.vote=function(n){
        n=Number(n);
        var choice;
        if(n===1||n===2) choice=n-1;
        else if(n===0) choice=0;
        else choice=1;
        postVote(choice);
      };

      window.initPoll=function(){ loadPoll(); };

      ['renderPoll','updatePoll','refreshPoll'].forEach(function(name){
        if(typeof window[name]==='function') window[name]=function(){};
      });

      loadPoll();

      var pollEl=document.querySelector('section#poll, #poll, [id="poll"]');
      if(pollEl){
        pollEl.querySelectorAll('[onclick*="vote"]').forEach(function(el){ el.removeAttribute('onclick'); });
        var opts=pollEl.querySelectorAll('.poll-option');
        opts.forEach(function(el, idx){
          if(idx>1) return;
          el.removeAttribute('onclick');
          el.style.cursor='pointer';
          el.addEventListener('click', function(ev){
            ev.preventDefault();
            postVote(idx);
          });
        });
      }

      function findRsvpSection(){
        return document.querySelector('section#rsvp, #rsvp');
      }

      function findRsvpForm(){
        var sec=findRsvpSection();
        if(!sec) return null;
        return sec.querySelector('form');
      }

      function findRsvpListAnchor(sec, form){
        var list=sec.querySelector('#rsvpList, #rsvpEntries, [id*="rsvp-list"], [class*="rsvp-list"], [id*="RsvpList"]');
        if(list) return list;
        var el=document.createElement('div');
        el.id='onet-rsvp-list';
        el.setAttribute('data-oneday-rsvp','1');
        el.style.cssText='margin-top:14px;';
        if(form&&form.parentNode) form.parentNode.insertBefore(el, form.nextSibling);
        else sec.appendChild(el);
        return el;
      }

      function findRsvpInputs(form){
        var nameIn=form.querySelector('input#guestName, input#rsvpName, input[name="name"], input[name*="name"]');
        if(!nameIn) nameIn=form.querySelector('input[type="text"]');
        var adultsIn=form.querySelector('input#adults, input[name*="adult"], input[name*="Adult"]');
        var kidsIn=form.querySelector('input#kids, input[name*="kid"], input[name*="Kid"]');
        var nums=form.querySelectorAll('input[type="number"]');
        if(!adultsIn&&nums.length) adultsIn=nums[0];
        if(!kidsIn&&nums.length>1) kidsIn=nums[1];
        return {nameIn:nameIn, adultsIn:adultsIn, kidsIn:kidsIn};
      }

      function ensureRsvpSummary(sec, form){
        var el=sec.querySelector('#onet-rsvp-summary');
        if(!el){
          el=document.createElement('p');
          el.id='onet-rsvp-summary';
          el.style.cssText='margin:12px 0;font-weight:600;';
          if(form&&form.parentNode) form.parentNode.insertBefore(el, form.nextSibling);
          else sec.insertBefore(el, sec.firstChild);
        }
        return el;
      }

      function renderRsvpRows(list, rows, totalAdults, totalKids, sec, form){
        list.innerHTML='';
        var sum=ensureRsvpSummary(sec, form);
        sum.textContent='Total: '+totalAdults+' adults, '+totalKids+' kids';
        if(!rows.length){
          list.innerHTML='<p style="opacity:.75;font-style:italic;">No RSVPs yet.</p>';
          return;
        }
        rows.forEach(function(r){
          var row=document.createElement('div');
          row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.08);';
          row.innerHTML='<span>'+esc(r.guest_name)+' — '+r.adults+' adult'+(r.adults!==1?'s':'')+', '+r.kids+' kid'+(r.kids!==1?'s':'')+'</span>';
          var del=document.createElement('button');
          del.type='button';
          del.textContent='×';
          del.title='Remove';
          del.style.cssText='flex-shrink:0;background:transparent;border:none;cursor:pointer;font-size:1.2rem;line-height:1;opacity:.6;';
          del.onclick=function(){
            if(!confirm('Remove this RSVP?')) return;
            fetch('/api/event-rsvps/delete',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({eventId:eid,id:r.id})
            })
            .then(function(res){ return res.json().then(function(j){ if(!res.ok) throw new Error(j.error||'delete failed'); return j; }); })
            .then(function(){ loadRsvps(); })
            .catch(function(err){ alert(err.message||'Could not remove'); });
          };
          row.appendChild(del);
          list.appendChild(row);
        });
      }

      function loadRsvps(){
        var sec=findRsvpSection();
        var form=findRsvpForm();
        if(!sec||!form) return;
        var list=findRsvpListAnchor(sec, form);
        fetch('/api/event-rsvps/list?eventId='+encodeURIComponent(eid))
          .then(function(r){ return r.json(); })
          .then(function(d){
            var rows=d.rsvps||[];
            renderRsvpRows(list, rows, d.totalAdults||0, d.totalKids||0, sec, form);
          })
          .catch(function(){});
      }

      function cloudRsvpSubmit(){
        var form=findRsvpForm();
        if(!form) return;
        var inp=findRsvpInputs(form);
        var name=(inp.nameIn&&inp.nameIn.value)?inp.nameIn.value.trim():'';
        var ad=inp.adultsIn?parseInt(inp.adultsIn.value,10):1;
        var kd=inp.kidsIn?parseInt(inp.kidsIn.value,10):0;
        if(!Number.isFinite(ad)||ad<1){ alert('Adults must be at least 1.'); return; }
        if(!Number.isFinite(kd)||kd<0){ alert('Kids must be 0 or more.'); return; }
        fetch('/api/event-rsvps/create',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({eventId:eid,guestName:name,adults:ad,kids:kd})
        })
        .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'rsvp failed'); return j; }); })
        .then(function(){
          if(inp.nameIn) inp.nameIn.value='';
          if(inp.adultsIn) inp.adultsIn.value='1';
          if(inp.kidsIn) inp.kidsIn.value='0';
          loadRsvps();
        })
        .catch(function(err){ alert(err.message||'Could not RSVP'); });
      }

      (function bootRsvp(){
        var sec=findRsvpSection();
        var form=findRsvpForm();
        if(!sec||!form) return;
        if(getComputedStyle(sec).visibility==='hidden') return;
        form.addEventListener('submit', function(e){
          e.preventDefault();
          e.stopImmediatePropagation();
          cloudRsvpSubmit();
        }, true);
        window.submitRSVP=cloudRsvpSubmit;
        window.handleRSVP=cloudRsvpSubmit;
        window.addRSVP=cloudRsvpSubmit;
        window.submitRsvpForm=cloudRsvpSubmit;
        ['renderRsvpList','loadRsvpsFromStorage','updateRsvpDisplay'].forEach(function(n){
          if(typeof window[n]==='function') window[n]=function(){};
        });
        loadRsvps();
      })();

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
          .then(function(d){
            renderMessages(d.messages||[]);
          })
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

      loadMessages();
    }, 0);
  });
})();
<\/script>`;
