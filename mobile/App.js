import 'react-native-url-polyfill/auto';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
}) : null;

const colors = { bg:'#F7F8F4', ink:'#29382F', muted:'#7D8A80', green:'#557765', pale:'#EAF0E9', white:'#FFFFFF', line:'#E6EBE4', red:'#B64A43' };
const sections = [
  ['overview','Overview','Your household at a glance'],
  ['shopping_items','Shopping list','Shared shopping'],
  ['bills','Bills & payments','Due dates and payments'],
  ['household_tasks','Household tasks','Chores and assignments'],
  ['maintenance_reminders','Maintenance','Home care and servicing'],
  ['household_events','Family calendar','Events and important dates'],
  ['home_assets','Home assets','Appliances and warranties'],
  ['shared_expenses','Shared expenses','Household spending'],
  ['household_documents','Document vault','Important family documents'],
  ['personal_expenses','Personal expenses','Private to your account'],
];
const tableFor = { shopping_items:'shopping_items', bills:'bills', household_tasks:'household_tasks', maintenance_reminders:'maintenance_reminders', household_events:'household_events', home_assets:'home_assets', shared_expenses:'shared_expenses', household_documents:'household_documents', personal_expenses:'personal_expenses' };

function PrimaryButton({ title, onPress, disabled }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({pressed})=>[styles.primary,disabled&&{opacity:.55},pressed&&{opacity:.8}]}><Text style={styles.primaryText}>{title}</Text></Pressable>;
}
function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType='default', autoCapitalize='none' }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#A0AAA1" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={styles.input}/></View>;
}

export default function App() {
  const [session,setSession] = useState(null);
  const [authReady,setAuthReady] = useState(false);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [household,setHousehold] = useState(null);
  const [counts,setCounts] = useState({});
  const [active,setActive] = useState('overview');
  const [memberCount,setMemberCount] = useState(0);
  const [houseName,setHouseName] = useState('');

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return ()=>subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let alive=true;
    async function loadHome() {
      if (!session || !supabase) { setHousehold(null); return; }
      const {data:membership,error}=await supabase.from('household_members').select('household_id,role').eq('user_id',session.user.id).limit(1);
      if (!alive) return;
      if (error) { Alert.alert('Could not load household',error.message); return; }
      if (!membership?.length) { setHousehold(null); return; }
      const id=membership[0].household_id;
      const [{data:home,error:homeError},{data:roster,error:rosterError}]=await Promise.all([
        supabase.from('households').select('id,name,invite_code,status').eq('id',id).single(),
        supabase.rpc('get_household_members')
      ]);
      if (!alive) return;
      if (homeError) { Alert.alert('Could not load household',homeError.message); return; }
      setHousehold({...home,role:membership[0].role});
      setHouseName(home.name);
      setMemberCount(roster?.length||0);
      if (rosterError) console.warn(rosterError.message);
      const pairs=await Promise.all(Object.entries(tableFor).map(async ([key,table])=>{
        let q=supabase.from(table).select('id',{count:'exact',head:true}).eq('household_id',id);
        if(key==='personal_expenses') q=q.eq('user_id',session.user.id);
        const {count,error}=await q;
        return [key,error?0:(count||0)];
      }));
      if (alive) setCounts(Object.fromEntries(pairs));
    }
    loadHome();
    return ()=>{alive=false;};
  },[session]);

  const signIn = async () => {
    if (!supabase) return Alert.alert('Setup required','Add the Supabase URL and anon/publishable key in mobile/.env before running the app.');
    if (!email.trim() || !password) return Alert.alert('Missing details','Enter your email and password.');
    setBusy(true);
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    setBusy(false);
    if(error) Alert.alert('Sign in failed',error.message);
  };
  const signUp = async () => {
    if (!supabase) return Alert.alert('Setup required','Configure the Supabase environment variables first.');
    if (!email.trim() || password.length<8) return Alert.alert('Check details','Enter a valid email and a password with at least 8 characters.');
    setBusy(true);
    const {error}=await supabase.auth.signUp({email:email.trim(),password});
    setBusy(false);
    if(error) Alert.alert('Sign up failed',error.message);
    else Alert.alert('Account created','Check your email if email confirmation is enabled, then sign in.');
  };
  const signOut = async () => { await supabase?.auth.signOut(); setHousehold(null); setCounts({}); };
  const activeSection=sections.find(s=>s[0]===active)||sections[0];

  if (!authReady) return <View style={styles.center}><ActivityIndicator size="large" color={colors.green}/><Text style={styles.muted}>Loading HomeBuddy…</Text></View>;
  if (!session) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor={colors.bg}/><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled"><View style={styles.brandIcon}><Text style={styles.brandIconText}>H</Text></View><Text style={styles.brand}>HomeBuddy</Text><Text style={styles.tagline}>One app. Every household. Everything organised.</Text><View style={styles.panel}><Text style={styles.heading}>Welcome home</Text><Text style={styles.muted}>Sign in to access your shared household.</Text><Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address"/><Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry/><PrimaryButton title={busy?'Please wait…':'Sign in'} onPress={signIn} disabled={busy}/><Pressable onPress={signUp} style={styles.textButton}><Text style={styles.link}>New to HomeBuddy? Create account</Text></Pressable></View><Text style={styles.footer}>Your household data stays protected by your existing Supabase account and database policies.</Text></ScrollView></KeyboardAvoidingView></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor={colors.bg}/><View style={styles.topbar}><View><Text style={styles.brandSmall}>HomeBuddy</Text><Text style={styles.mutedSmall}>{household?.name||'Your home'}</Text></View><Pressable onPress={signOut}><Text style={styles.link}>Sign out</Text></Pressable></View>
    {!household ? <View style={styles.empty}><Text style={styles.heading}>Let’s set up your home</Text><Text style={styles.muted}>You’re signed in, but this account is not linked to a household yet. Household creation and invite-code joining are part of the next migration milestone.</Text></View> :
    <ScrollView contentContainerStyle={styles.content}><View style={styles.hero}><Text style={styles.eyebrow}>YOUR HOUSEHOLD</Text><Text style={styles.heroTitle}>{household.name}</Text><Text style={styles.heroSub}>{memberCount} {memberCount===1?'member':'members'} · {household.role}</Text></View><Text style={styles.sectionTitle}>{activeSection[1]}</Text><Text style={styles.muted}>{activeSection[2]}</Text>
      {active==='overview' ? <View style={styles.grid}>{sections.slice(1).map(s=><Pressable key={s[0]} onPress={()=>setActive(s[0])} style={styles.tile}><Text style={styles.tileCount}>{counts[s[0]]??'—'}</Text><Text style={styles.tileTitle}>{s[1]}</Text><Text style={styles.tileSub}>{s[2]}</Text></Pressable>)}</View> : <View style={styles.panel}><Text style={styles.heading}>{activeSection[1]}</Text><Text style={styles.muted}>This native section is being migrated. Your existing data remains in Supabase and the current web app continues to work.</Text><PrimaryButton title="Back to overview" onPress={()=>setActive('overview')}/></View>}
    </ScrollView>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{sections.slice(0,7).map(s=><Pressable key={s[0]} onPress={()=>setActive(s[0])} style={[styles.tab,active===s[0]&&styles.tabActive]}><Text style={[styles.tabText,active===s[0]&&styles.tabTextActive]}>{s[1]}</Text></Pressable>)}</ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.bg},flex:{flex:1},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.bg,gap:12},authWrap:{flexGrow:1,justifyContent:'center',padding:26},brandIcon:{width:58,height:58,borderRadius:18,backgroundColor:colors.green,alignItems:'center',justifyContent:'center',alignSelf:'center'},brandIconText:{fontSize:30,fontWeight:'800',color:'#fff'},brand:{fontSize:30,fontWeight:'800',color:colors.ink,textAlign:'center',marginTop:14},tagline:{fontSize:13,color:colors.muted,textAlign:'center',marginTop:6,marginBottom:28},panel:{backgroundColor:colors.white,borderRadius:20,padding:20,borderWidth:1,borderColor:colors.line,gap:10},heading:{fontSize:22,fontWeight:'800',color:colors.ink},muted:{fontSize:13,color:colors.muted,lineHeight:20},mutedSmall:{fontSize:11,color:colors.muted,marginTop:2},field:{gap:6,marginTop:8},label:{fontSize:12,fontWeight:'700',color:colors.ink},input:{borderWidth:1,borderColor:colors.line,borderRadius:11,paddingHorizontal:13,paddingVertical:12,fontSize:14,color:colors.ink,backgroundColor:'#fff'},primary:{backgroundColor:colors.green,borderRadius:11,padding:14,alignItems:'center',marginTop:8},primaryText:{color:'#fff',fontWeight:'700',fontSize:14},textButton:{alignItems:'center',padding:8},link:{color:colors.green,fontWeight:'700',fontSize:13},footer:{fontSize:11,color:colors.muted,textAlign:'center',lineHeight:17,marginTop:20},topbar:{paddingHorizontal:20,paddingVertical:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderColor:colors.line},brandSmall:{fontSize:19,fontWeight:'800',color:colors.ink},content:{padding:18,paddingBottom:24},hero:{backgroundColor:colors.green,borderRadius:18,padding:20,marginBottom:24},eyebrow:{fontSize:10,color:'#DDE9DF',fontWeight:'800',letterSpacing:1.5},heroTitle:{fontSize:24,color:'#fff',fontWeight:'800',marginTop:7},heroSub:{fontSize:12,color:'#E2ECE3',marginTop:5},sectionTitle:{fontSize:22,color:colors.ink,fontWeight:'800',marginBottom:4},grid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:16},tile:{width:'48%',backgroundColor:'#fff',borderWidth:1,borderColor:colors.line,borderRadius:15,padding:14,minHeight:105},tileCount:{fontSize:24,fontWeight:'800',color:colors.green},tileTitle:{fontSize:13,fontWeight:'800',color:colors.ink,marginTop:7},tileSub:{fontSize:10,color:colors.muted,marginTop:3},empty:{flex:1,justifyContent:'center',padding:26,gap:12},tabs:{paddingHorizontal:12,paddingVertical:10,gap:7,borderTopWidth:1,borderColor:colors.line,backgroundColor:'#fff'},tab:{paddingHorizontal:13,paddingVertical:9,borderRadius:20,backgroundColor:colors.bg},tabActive:{backgroundColor:colors.pale},tabText:{fontSize:11,color:colors.muted,fontWeight:'700'},tabTextActive:{color:colors.green}
});
