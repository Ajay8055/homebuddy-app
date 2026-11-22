import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const str=(v,n=180)=>typeof v==="string"?v.trim().slice(0,n):"";
const dateOk=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"));
const money=v=>typeof v==="number"&&Number.isFinite(v)&&v>0&&v<=100000000?Number(v.toFixed(2)):null;
const freq=v=>["none","weekly","monthly","yearly"].includes(String(v))?String(v):"none";
const definitions=[
{type:"function",function:{name:"add_shopping_item",description:"Add an item to the shared shopping list.",parameters:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string"},quantity:{type:"string"}}}}},
{type:"function",function:{name:"create_reminder",description:"Create a household reminder/task. Dates must be YYYY-MM-DD; due_at must be ISO 8601 with +05:30 timezone if user specified a time.",parameters:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string"},due_date:{type:"string"},due_at:{type:"string"},priority:{type:"string",enum:["low","normal","high"]},description:{type:"string"},recurrence_frequency:{type:"string",enum:["none","weekly","monthly","yearly"]},assigned_to_name:{type:"string"}}}}},
{type:"function",function:{name:"create_bill",description:"Add a bill due item; never make a payment.",parameters:{type:"object",additionalProperties:false,required:["name","amount"],properties:{name:{type:"string"},amount:{type:"number"},due_date:{type:"string"},recurrence_frequency:{type:"string",enum:["none","weekly","monthly","yearly"]}}}}},
{type:"function",function:{name:"create_household_task",description:"Create a household task and optionally assign it to a family member.",parameters:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string"},due_date:{type:"string"},assigned_to_name:{type:"string"},priority:{type:"string",enum:["low","normal","high"]},description:{type:"string"},recurrence_frequency:{type:"string",enum:["none","weekly","monthly","yearly"]}}}}},
{type:"function",function:{name:"record_shared_expense",description:"Record an expense shared with the household.",parameters:{type:"object",additionalProperties:false,required:["name","amount"],properties:{name:{type:"string"},amount:{type:"number"},category:{type:"string"},expense_date:{type:"string"},notes:{type:"string"}}}}},
{type:"function",function:{name:"record_personal_expense",description:"Record a private expense visible only to the signed-in user.",parameters:{type:"object",additionalProperties:false,required:["name","amount"],properties:{name:{type:"string"},amount:{type:"number"},category:{type:"string"},expense_date:{type:"string"}}}}},
{type:"function",function:{name:"create_maintenance_reminder",description:"Create a home maintenance reminder.",parameters:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string"},details:{type:"string"},service_date:{type:"string"},recurrence_frequency:{type:"string",enum:["none","monthly","yearly"]}}}}},
{type:"function",function:{name:"complete_household_task",description:"Mark one uniquely named pending household task or reminder as complete.",parameters:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string"}}}}},
{type:"function",function:{name:"complete_shopping_item",description:"Mark one uniquely named pending shopping item as done.",parameters:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string"}}}}},
{type:"function",function:{name:"mark_bill_paid",description:"Mark one bill as paid ONLY after the user explicitly confirmed this exact change in the immediately previous assistant turn.",parameters:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string"}}}}},
{type:"function",function:{name:"delete_household_record",description:"Permanently delete one record ONLY after the user explicitly confirmed deletion in the immediately previous assistant turn. Shared deletes may be restricted to the household owner.",parameters:{type:"object",additionalProperties:false,required:["module","name"],properties:{module:{type:"string",enum:["shopping","tasks","bills","maintenance","events","assets","shared_expenses","personal_expenses"]},name:{type:"string"}}}}},
{type:"function",function:{name:"list_household_records",description:"List records from a supported household module.",parameters:{type:"object",additionalProperties:false,required:["module"],properties:{module:{type:"string",enum:["shopping","reminders","bills","tasks","expenses","personal_expenses","maintenance","documents"]},status:{type:"string",enum:["pending","completed","all"]}}}}}
];
async function action(db,uid,hid,n,a){
 const name=str(a.name);
 if(n!=="list_household_records"&&!name)throw Error("Please provide a name for this item.");
 if(n==="complete_household_task"||n==="complete_shopping_item"){
  const table=n==="complete_household_task"?"household_tasks":"shopping_items",done=n==="complete_household_task"?"is_done":"is_done";
  const {data:matches,error:findError}=await db.from(table).select("id,name,due_date,recurrence_frequency").eq("household_id",hid).eq(done,false).ilike("name",name).limit(2);if(findError)throw findError;if(!matches?.length)throw Error("I couldn't find a pending item named "+name+".");if(matches.length>1)throw Error("I found more than one matching item. Please specify which one.");
  const patch=n==="complete_household_task"?{is_done:true,completed_at:new Date().toISOString()}:{is_done:true};
  const {data,error}=await db.from(table).update(patch).eq("id",matches[0].id).eq("household_id",hid).select("id,name,is_done").single();if(error)throw error;return {message:"Marked "+data.name+" as completed.",record:data};
 }
 if(n==="mark_bill_paid"){
  const {data:matches,error:findError}=await db.from("bills").select("id,name,amount,due_date,recurrence_frequency").eq("household_id",hid).eq("is_paid",false).ilike("name",name).limit(2);if(findError)throw findError;if(!matches?.length)throw Error("I couldn't find an unpaid bill named "+name+".");if(matches.length>1)throw Error("I found more than one matching bill. Please specify which one.");
  const bill=matches[0],{data,error}=await db.from("bills").update({is_paid:true,paid_at:new Date().toISOString()}).eq("id",bill.id).eq("household_id",hid).select("id,name,amount,is_paid").single();if(error)throw error;
  return {message:"Marked "+data.name+" as paid in HomeBuddy. No money was transferred.",record:data};
 }
 if(n==="delete_household_record"){
  const map={shopping:"shopping_items",tasks:"household_tasks",bills:"bills",maintenance:"maintenance_reminders",events:"household_events",assets:"home_assets",shared_expenses:"shared_expenses",personal_expenses:"personal_expenses"};
  const table=map[String(a.module)];if(!table)throw Error("That record type cannot be deleted here.");const nameColumn=a.module==="events"?"title":"name";
  let q=db.from(table).select("id,"+nameColumn).eq("household_id",hid).ilike(nameColumn,name).limit(2);if(a.module==="personal_expenses")q=q.eq("user_id",uid);
  const {data:matches,error:findError}=await q;if(findError)throw findError;if(!matches?.length)throw Error("I couldn't find a record named "+name+".");if(matches.length>1)throw Error("More than one record matches. Please specify which one.");
  let d=db.from(table).delete().eq("id",matches[0].id).eq("household_id",hid);if(a.module==="personal_expenses")d=d.eq("user_id",uid);const {error}=await d;if(error)throw error;return {message:"Deleted "+name+".",record:{id:matches[0].id,name:matches[0][nameColumn]}};
 }
 if(n==="add_shopping_item"){
  const {data,error}=await db.from("shopping_items").insert({household_id:hid,name,quantity:str(a.quantity,80)}).select("id,name,quantity,is_done").single();if(error)throw error;return {message:"Added "+data.name+" to the shopping list.",record:data};
 }
 if(n==="create_reminder"||n==="create_household_task"){
  const due=a.due_date?(dateOk(a.due_date)?a.due_date:null):null;if(a.due_date&&!due)throw Error("I couldn't understand that date. Please specify it again.");
  let assigned=null;const assignedName=str(a.assigned_to_name,100);
  if(assignedName){const {data,error}=await db.rpc("get_household_members");if(error)throw error;const matches=(data||[]).filter(m=>str(m.display_name||m.email||m.name,100).toLowerCase()===assignedName.toLowerCase());if(matches.length!==1)throw Error(matches.length?"More than one family member matches. Please clarify.":"I couldn't find a household member named "+assignedName+".");assigned=matches[0].user_id;}
  const dueAt=str(a.due_at,80);if(dueAt&&Number.isNaN(Date.parse(dueAt)))throw Error("I couldn't understand that reminder time.");
  const {data:dups,error:de}=await db.from("household_tasks").select("id,name,due_date").eq("household_id",hid).eq("is_done",false).ilike("name",name).limit(1);if(de)throw de;if(dups?.length)return {needs_confirmation:true,message:"A pending reminder/task named "+dups[0].name+" already exists. Should I add another one?",duplicate:dups[0]};
  const row={household_id:hid,name,due_label:due||"Today",due_date:due,assigned_to:assigned,priority:["low","normal","high"].includes(a.priority)?a.priority:"normal",description:str(a.description,1000),recurrence_frequency:freq(a.recurrence_frequency),is_done:false};if(dueAt)row.due_at=dueAt;
  const {data,error}=await db.from("household_tasks").insert(row).select("id,name,due_date,due_at,priority,assigned_to,recurrence_frequency").single();if(error)throw error;return {message:"Created reminder: "+data.name+(due?" for "+due:"")+".",record:data};
 }
 if(n==="create_bill"){
  const amount=money(a.amount);if(amount===null)throw Error("Please specify a valid bill amount.");const due=a.due_date?(dateOk(a.due_date)?a.due_date:null):null;if(a.due_date&&!due)throw Error("Please specify a valid bill due date.");
  const {data:dups,error:de}=await db.from("bills").select("id,name,amount,due_date").eq("household_id",hid).eq("is_paid",false).ilike("name",name).eq("amount",amount).limit(1);if(de)throw de;if(dups?.length)return {needs_confirmation:true,message:"A pending "+name+" bill for ₹"+amount+" already exists. Should I add another one?",duplicate:dups[0]};
  const {data,error}=await db.from("bills").insert({household_id:hid,name,amount,due_date:due,is_paid:false,recurrence_frequency:freq(a.recurrence_frequency)}).select("id,name,amount,due_date,is_paid").single();if(error)throw error;return {message:"Added "+name+" bill for ₹"+amount+(due?", due "+due:"")+". No payment was made.",record:data};
 }
 if(n==="record_shared_expense"||n==="record_personal_expense"){
  const amount=money(a.amount);if(amount===null)throw Error("Please specify an expense amount greater than zero.");const date=a.expense_date?(dateOk(a.expense_date)?a.expense_date:null):new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});if(!date)throw Error("Please specify a valid expense date.");
  const personal=n==="record_personal_expense",table=personal?"personal_expenses":"shared_expenses";
  const row=personal?{household_id:hid,user_id:uid,name,amount,category:str(a.category,60)||"Other",expense_date:date}:{household_id:hid,name,amount,category:str(a.category,60)||"Other",expense_date:date,notes:str(a.notes,500)};
  const {data,error}=await db.from(table).insert(row).select("id,name,amount,category,expense_date").single();if(error)throw error;return {message:"Recorded "+(personal?"personal":"shared")+" expense "+name+" for ₹"+amount+".",record:data};
 }
 if(n==="create_maintenance_reminder"){
  const date=a.service_date?(dateOk(a.service_date)?a.service_date:null):null;if(a.service_date&&!date)throw Error("Please specify a valid maintenance date.");
  const {data,error}=await db.from("maintenance_reminders").insert({household_id:hid,name,details:str(a.details,1000),service_date:date,recurrence_frequency:freq(a.recurrence_frequency)}).select("id,name,details,service_date").single();if(error)throw error;return {message:"Created maintenance reminder for "+name+".",record:data};
 }
 if(n==="list_household_records"){
  const mod=String(a.module||""),map={shopping:["shopping_items","id,name,quantity,is_done,created_at","created_at"],reminders:["household_tasks","id,name,due_date,due_at,is_done,assigned_to,priority","due_date"],tasks:["household_tasks","id,name,due_date,due_at,is_done,assigned_to,priority","due_date"],bills:["bills","id,name,amount,due_date,is_paid,recurrence_frequency","due_date"],expenses:["shared_expenses","id,name,amount,category,expense_date","expense_date"],personal_expenses:["personal_expenses","id,name,amount,category,expense_date","expense_date"],maintenance:["maintenance_reminders","id,name,details,service_date,recurrence_frequency","service_date"],documents:["household_documents","id,name,category,mime_type,file_size,created_at","created_at"]};
  const c=map[mod];if(!c)throw Error("That module isn't supported yet.");let q=db.from(c[0]).select(c[1]).eq("household_id",hid).order(c[2],{ascending:false}).limit(30);if(mod==="personal_expenses")q=q.eq("user_id",uid);const status=String(a.status||"pending");if(["shopping","reminders","tasks"].includes(mod)&&status!=="all")q=q.eq("is_done",status==="completed");if(mod==="bills"&&status!=="all")q=q.eq("is_paid",status==="completed");const {data,error}=await q;if(error)throw error;return {message:(data?.length||0)+" "+mod+" record(s) found.",records:data||[]};
 }
 throw Error("I can't perform that action yet.");
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return out({error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return out({error:"Please sign in to use HomeBuddy AI."},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");if(!url||!anon)return out({error:"AI service is not configured."},503);
  const db=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:ae}=await db.auth.getUser();if(ae||!user)return out({error:"Your session expired. Sign in again."},401);
  const body=await req.json(),message=str(body?.message,4000);if(!message)return out({error:"Please type or speak a message."},400);if(typeof body?.message==="string"&&body.message.length>4000)return out({error:"Message is too long."},400);
  const requestId=str(body?.requestId,160)||crypto.randomUUID();let conversationId=str(body?.conversationId,64);
  const {data:members,error:me}=await db.from("household_members").select("household_id").eq("user_id",user.id).limit(2);if(me)throw me;if(!members?.length)return out({error:"Create or join a household first."},409);if(members.length>1)return out({error:"Select a household before continuing."},409);const hid=members[0].household_id;
  if(conversationId){const {data,error}=await db.from("ai_conversations").select("id").eq("id",conversationId).eq("household_id",hid).single();if(error||!data)return out({error:"Conversation not found or access denied."},404);}
  else{const {data,error}=await db.from("ai_conversations").insert({user_id:user.id,household_id:hid,title:message.slice(0,70)}).select("id").single();if(error)throw error;conversationId=data.id;}
  const {count:recentCount,error:rateError}=await db.from("ai_messages").select("id",{count:"exact",head:true}).eq("user_id",user.id).gte("created_at",new Date(Date.now()-60000).toISOString());if(rateError)throw rateError;if((recentCount||0)>=15)return out({error:"You are sending messages too quickly. Please wait a minute and try again."},429);
  const {data:dupe}=await db.from("ai_messages").select("id").eq("conversation_id",conversationId).eq("user_id",user.id).contains("metadata",{request_id:requestId}).limit(1).maybeSingle();if(dupe)return out({conversationId,duplicateRequest:true,reply:"I have already received this message. Check the conversation before retrying."});
  const {error:saveError}=await db.from("ai_messages").insert({conversation_id:conversationId,user_id:user.id,role:"user",content:message,metadata:{request_id:requestId}});if(saveError)throw saveError;
  const key=Deno.env.get("AI_API_KEY");if(!key)return out({conversationId,needsConfiguration:true,error:"Your message is saved, but the AI provider key is not configured. No household action was executed."},503);
  const base=(Deno.env.get("AI_BASE_URL")||"https://api.openai.com/v1").replace(/\/$/,""),model=Deno.env.get("AI_MODEL")||"gpt-4o-mini";
  const {data:history,error:he}=await db.from("ai_messages").select("role,content").eq("conversation_id",conversationId).eq("user_id",user.id).order("created_at",{ascending:true}).limit(20);if(he)throw he;
  const now=new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"});
  const system="You are HomeBuddy, a household assistant in India. Current Asia/Kolkata date/time: "+now+". Understand English, Hindi and Hinglish; reply in the user's language. Convert relative dates accurately using the current date/time; pass YYYY-MM-DD dates and ISO 8601 timestamps with +05:30 offset. Never guess amounts, dates, times or people. Ask one short clarification if required information is missing. Use tools to execute clear low-risk requests and never claim success unless the tool confirms it. Adding a bill only records a due item and does not pay it. Never delete a record or mark a bill paid unless you first ask the user to confirm and the user confirms in their next message. Never transfer ownership or change memberships. Use private expense tool only when user explicitly means personal/private; shared expenses are visible to family. Ask the user before retrying duplicates. Document search returns metadata only, not file contents. Be concise.";
  const payload={model,temperature:0.1,messages:[{role:"system",content:system},...(history||[]).map(m=>({role:m.role==="tool"?"assistant":m.role,content:m.content}))],tools:definitions,tool_choice:"auto"};
  const response=await fetch(base+"/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  if(!response.ok){console.error("AI provider status",response.status);return out({conversationId,error:"AI provider is temporarily unavailable. Please retry shortly."},502);}
  const completion=await response.json(),assistant=completion?.choices?.[0]?.message||{},calls=assistant.tool_calls||[],results=[];
  for(const call of calls.slice(0,3)){
   const n=call?.function?.name;if(!definitions.some(t=>t.function.name===n))continue;let args;try{args=JSON.parse(call.function.arguments||"{}");}catch{results.push({error:"Invalid action details. Please rephrase."});continue;}
   if(n==="mark_bill_paid"||n==="delete_household_record"){
    const confirmed=/^(yes|yeah|yep|confirm|please do|go ahead|haan|han|ji|kar do|theek hai|do it|proceed)\\b/i.test(message);
    const previous=history?.slice(0,-1).reverse().find(m=>m.role==="assistant");
    if(!confirmed||!previous||!/(confirm|should i|shall i|are you sure|do you want)/i.test(previous.content||"")){results.push({error:"This action needs a clear confirmation first. Ask the user to confirm, then wait for their next message."});continue;}
   }
   const keyId=requestId+":"+n;const {data:ledger,error:le}=await db.from("ai_action_requests").insert({user_id:user.id,household_id:hid,idempotency_key:keyId,action_type:n,status:"started"}).select("id").single();
   if(le?.code==="23505"){results.push({message:"This action request was already processed; I did not repeat it.",duplicateRequest:true});continue;}if(le)throw le;
   try{const r=await action(db,user.id,hid,n,args);const status=r.needs_confirmation?"needs_confirmation":"succeeded";const {error:ue}=await db.from("ai_action_requests").update({status,result:r}).eq("id",ledger.id);if(ue)throw ue;results.push(r);}
   catch(e){await db.from("ai_action_requests").update({status:"failed",result:{error:e instanceof Error?e.message:"Action failed"}}).eq("id",ledger.id);results.push({error:e instanceof Error?e.message:"Action failed"});}
  }
  let reply=assistant.content||"";
  if(calls.length){const follow=await fetch(base+"/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model,temperature:0.1,messages:[{role:"system",content:system},...(history||[]).map(m=>({role:m.role==="tool"?"assistant":m.role,content:m.content})),{role:"assistant",content:assistant.content||null,tool_calls:calls},...calls.map((c,i)=>({role:"tool",tool_call_id:c.id,content:JSON.stringify(results[i]||{error:"Not executed"})}))]}),signal:AbortSignal.timeout(25000)});if(follow.ok){const f=await follow.json();reply=f?.choices?.[0]?.message?.content||reply;}}
  if(!reply)reply=results.map(r=>r.message||r.error).filter(Boolean).join("\n")||"I couldn't complete that. Could you rephrase it?";
  const {error:saveAssistant}=await db.from("ai_messages").insert({conversation_id:conversationId,user_id:user.id,role:"assistant",content:reply,metadata:{actions:results.map(r=>({message:r.message,needs_confirmation:!!r.needs_confirmation,record_id:r.record?.id}))}});if(saveAssistant)throw saveAssistant;
  return out({conversationId,reply,actions:results});
 }catch(e){console.error("homebuddy-ai failure",e instanceof Error?e.message:"unknown");return out({error:e instanceof Error?e.message:"Something went wrong."},400);}
});
