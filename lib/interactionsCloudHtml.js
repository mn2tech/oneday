/**
 * Injected before </body> when SUPABASE_SERVICE_ROLE_KEY is set.
 * Replaces local-only message wall with shared Supabase-backed API (poll + RSVP stay localStorage in page HTML).
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
