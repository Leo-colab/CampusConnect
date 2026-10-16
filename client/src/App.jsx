import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Bot, Check, CheckCheck,
  ChevronDown, ChevronRight, CircleHelp, Clock3, CloudUpload, Command, Copy, Cpu,
  FileCheck2, FileImage, Filter, GraduationCap, ImagePlus, LayoutDashboard, Lightbulb,
  LoaderCircle, MapPin, Menu, MessageCircle, MoreHorizontal, Package, Plus, Search,
  ScanSearch, Send, ShieldCheck, Sparkles, Tags, Target, Trash2, Upload, Users,
  Workflow, X, XCircle, Zap, CalendarDays, ChartNoAxesCombined, Eye, SlidersHorizontal,
  RefreshCw, CheckCircle2, AlertTriangle, Inbox, ListFilter, ChevronLeft, WandSparkles,
  Fingerprint, Map, CircleCheck, BellRing
} from 'lucide-react';
import { api, jsonBody, dateLabel, timeAgo, imageUrl } from './api.js';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'items', label: 'Lost & found', icon: Package },
  { id: 'matches', label: 'AI matches', icon: Target, badge: true },
  { id: 'agents', label: 'Agent workspace', icon: Bot },
  { id: 'claims', label: 'Claim review', icon: ShieldCheck },
  { id: 'analytics', label: 'Campus insights', icon: ChartNoAxesCombined },
  { id: 'notifications', label: 'Notifications', icon: Bell }
];
const CATEGORIES = ['Electronics', 'Books & Stationery', 'Bags & Backpacks', 'Clothing', 'ID Cards & Documents', 'Keys', 'Wallets & Money', 'Jewelry & Watches', 'Sports Equipment', 'Other'];
const AGENT_META = {
  'Visual Identification Agent': { icon: ScanSearch, tone: 'violet', short: 'Vision' },
  'Matchmaking Agent': { icon: Target, tone: 'blue', short: 'Matching' },
  'Recovery Workflow Agent': { icon: Workflow, tone: 'mint', short: 'Recovery' },
  'Claim Safety Agent': { icon: ShieldCheck, tone: 'amber', short: 'Safety' },
  'Campus Intelligence Agent': { icon: ChartNoAxesCombined, tone: 'rose', short: 'Insights' }
};
const AGENT_COPY = {
  'Visual Identification Agent': 'Reads the object, colors and visible features in a photo.',
  'Matchmaking Agent': 'Finds likely counterparts across lost and found reports.',
  'Recovery Workflow Agent': 'Creates follow-up tasks and coordinates a safe hand-off.',
  'Claim Safety Agent': 'Summarizes verification evidence; never approves a claim automatically.',
  'Campus Intelligence Agent': 'Surfaces campus patterns to help staff prioritize recovery.'
};

function StatusPill({ children, tone = 'neutral', dot = false }) {
  return <span className={`status-pill tone-${tone}`}>{dot && <i />} {children}</span>;
}

function Button({ children, variant = 'primary', size = '', className = '', ...props }) {
  return <button className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} {...props}>{children}</button>;
}

function PageHeading({ eyebrow, title, subtitle, right }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{right && <div className="page-heading-actions">{right}</div>}</div>;
}

function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24} /></div><h3>{title}</h3><p>{message}</p>{action}</div>;
}

function MiniItemImage({ item, className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl(item?.imageUrl);
  return <div className={`item-photo ${className} ${!src || failed ? 'item-photo-empty' : ''}`}>
    {src && !failed ? <img src={src} alt={item?.title || 'Reported item'} onError={() => setFailed(true)} /> : <FileImage size={26} />}
  </div>;
}

function MatchCard({ match, onOpenItem, onReview, compact = false }) {
  const lost = match.lostItem;
  const found = match.foundItem;
  if (!lost || !found) return null;
  const tone = match.score >= 65 ? 'mint' : match.score >= 45 ? 'blue' : 'amber';
  return <div className={`match-card ${compact ? 'match-card-compact' : ''}`}>
    <div className="match-card-head"><span className="match-label"><Sparkles size={13} /> AI suggested</span><StatusPill tone={tone}>{match.score}% fit</StatusPill></div>
    <div className="match-pair">
      <button className="match-item" onClick={() => onOpenItem?.(lost)}><MiniItemImage item={lost} /><span><small>LOST REPORT</small><b>{lost.title}</b><em><MapPin size={12} />{lost.location}</em></span></button>
      <div className="match-connector"><span><ArrowRight size={16} /></span><i /></div>
      <button className="match-item" onClick={() => onOpenItem?.(found)}><MiniItemImage item={found} /><span><small>FOUND REPORT</small><b>{found.title}</b><em><MapPin size={12} />{found.location}</em></span></button>
    </div>
    {!compact && <div className="match-reasons">{(match.reasons || []).slice(0, 3).map((reason) => <span key={reason}><Check size={12} />{reason}</span>)}</div>}
    <div className="match-card-foot"><span className="muted-copy"><Activity size={13} />{match.status === 'suggested' ? 'Awaiting review' : `Status: ${match.status}`}</span><div className="inline-actions"><Button variant="ghost" size="sm" onClick={() => onReview?.(match, 'reviewing')}>Review</Button>{!compact&&<><Button variant="ghost" size="sm" onClick={() => onReview?.(match, 'dismissed')}>Dismiss</Button><Button variant="soft" size="sm" onClick={() => onReview?.(match, 'resolved')}><CheckCircle2 size={13}/> Mark recovered</Button></>}<Button variant="outline" size="sm" onClick={() => onOpenItem?.(lost)}>Details <ChevronRight size={14} /></Button></div></div>
  </div>;
}

function ItemCard({ item, onOpen, onDelete }) {
  return <article className="report-card">
    <button className="report-card-image" onClick={() => onOpen(item)}><MiniItemImage item={item} /><span className={`type-chip ${item.type}`}>{item.type === 'lost' ? 'Lost' : 'Found'}</span></button>
    <div className="report-card-body"><div className="report-card-category"><Tags size={12} />{item.category}<span className="chip-dot" />{dateLabel(item.itemDate)}</div>
      <button className="report-card-title" onClick={() => onOpen(item)}>{item.title}</button>
      <p>{item.description}</p><div className="report-card-foot"><span><MapPin size={13} />{item.location}</span><StatusPill tone={item.status === 'open' ? 'mint' : 'neutral'}>{item.status}</StatusPill>{onDelete && <button className="icon-button tiny-danger" title="Delete local demo report" onClick={() => onDelete(item)}><Trash2 size={14} /></button>}</div>
    </div>
  </article>;
}

function StatCard({ label, value, trend, icon: Icon, tone = 'mint', detail }) {
  return <div className="stat-card"><div className="stat-card-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={18} /></span></div><div className="stat-card-value">{value ?? '—'}</div><div className="stat-card-bottom">{trend && <span className={`trend ${trend.startsWith('-') ? 'down' : ''}`}><ArrowUpRight size={13} />{trend}</span>}<span>{detail}</span></div></div>;
}

function AgentCard({ agent, latestRun, onRun }) {
  const meta = AGENT_META[agent.name] || { icon: Bot, tone: 'blue', short: 'Agent' };
  const Icon = meta.icon;
  return <div className="agent-card"><div className="agent-card-top"><div className={`agent-icon ${meta.tone}`}><Icon size={20} /></div><StatusPill tone={latestRun ? 'mint' : 'neutral'} dot>{latestRun ? 'Ready' : 'Standby'}</StatusPill></div><h3>{agent.name}</h3><p>{agent.role || AGENT_COPY[agent.name]}</p><div className="agent-latest"><span>Latest run</span><span>{latestRun ? timeAgo(latestRun.createdAt) : 'No runs yet'}</span></div><div className="agent-run-summary">{latestRun?.summary || 'Waiting for a new report to process.'}</div>{onRun && <Button variant="ghost" size="sm" className="agent-action" onClick={() => onRun(agent)}><RefreshCw size={13} /> Run workflow</Button>}</div>;
}

function ActivityRow({ run }) {
  const meta = AGENT_META[run.agent] || { icon: Activity, tone: 'blue' };
  const Icon = meta.icon;
  return <div className="activity-row"><div className={`activity-icon ${meta.tone}`}><Icon size={15} /></div><div className="activity-copy"><div className="activity-title-line"><b>{run.agent}</b><StatusPill tone={run.status === 'failed' ? 'rose' : 'mint'}>{run.status || 'completed'}</StatusPill></div><p>{run.summary}</p><span>{timeAgo(run.createdAt)}{run.durationMs ? ` · ${run.durationMs} ms` : ''}</span></div></div>;
}

function OverviewPage({ dashboard, items, matches, agents, runs, onReport, onOpenItem, onReview, onNavigate, onRunAll }) {
  const fresh = items.slice(0, 4);
  const topMatches = matches.filter((match) => !['dismissed', 'resolved'].includes(match.status)).slice(0, 2);
  const recentRuns = runs.slice(0, 4);
  return <>
    <section className="welcome-banner"><div className="welcome-decoration deco-one" /><div className="welcome-decoration deco-two" /><div className="welcome-content"><div className="banner-kicker"><Sparkles size={13} /> YOUR CAMPUS, CONNECTED</div><h2>Lost something?<br /><span>Let's bring it back.</span></h2><p>AI-powered visual search and coordinated recovery, built for your campus community.</p><div className="welcome-actions"><Button onClick={onReport}><Plus size={17} /> Report an item</Button><Button variant="banner-ghost" onClick={() => onNavigate('matches')}>Explore AI matches <ArrowRight size={15} /></Button></div></div><div className="welcome-art"><div className="art-orbit orbit-a" /><div className="art-orbit orbit-b" /><div className="art-core"><ScanSearch size={39} strokeWidth={1.5} /></div><span className="float-icon float-a"><FileImage size={19} /></span><span className="float-icon float-b"><Target size={19} /></span><span className="float-icon float-c"><CheckCircle2 size={18} /></span><div className="art-label"><span className="pulse-dot" /> Agents working together</div></div></section>
    <div className="section-row stats-section-heading"><div><h3>Campus at a glance</h3><p>A quick pulse on reports and recoveries</p></div><span className="sync-caption"><span className="live-dot" /> Updated just now</span></div>
    <div className="stats-grid"><StatCard label="Total reports" value={dashboard.total ?? items.length} icon={Package} tone="blue" trend="+12%" detail="Across the campus"/><StatCard label="Lost items" value={dashboard.lost ?? items.filter((x) => x.type === 'lost').length} icon={Search} tone="violet" detail="Seeking their owners"/><StatCard label="Found items" value={dashboard.found ?? items.filter((x) => x.type === 'found').length} icon={CheckCheck} tone="mint" detail="Ready to be reunited"/><StatCard label="Possible matches" value={dashboard.highMatches ?? matches.filter((x) => x.score >= 50).length} icon={Target} tone="amber" trend="Live" detail="AI candidates to review"/></div>
    <div className="content-grid main-grid"><section className="surface-panel match-panel"><div className="panel-heading"><div><div className="panel-kicker"><Sparkles size={12} /> INTELLIGENT DISCOVERY</div><h3>Promising matches</h3><p>Ranked by visual attributes and campus context</p></div><button className="text-action" onClick={() => onNavigate('matches')}>View all <ArrowRight size={14}/></button></div>{topMatches.length ? <div className="match-stack">{topMatches.map((match) => <MatchCard key={match.id} match={match} compact onOpenItem={onOpenItem} onReview={onReview}/>)}</div> : <EmptyState icon={Target} title="No candidate matches yet" message="Report a lost or found item to start the matching agents." action={<Button size="sm" onClick={onReport}>Create report</Button>} />}</section>
      <section className="surface-panel agent-health-panel"><div className="panel-heading"><div><div className="panel-kicker"><Bot size={12} /> AGENT NETWORK</div><h3>Agent workspace</h3><p>Specialists collaborating on recovery</p></div><button className="circle-soft" onClick={onRunAll} title="Run all agents"><RefreshCw size={15}/></button></div><div className="mini-agent-list">{agents.slice(0, 4).map((agent) => { const run = runs.find((entry) => entry.agent === agent.name); const meta = AGENT_META[agent.name] || { icon: Bot, tone: 'blue' }; const Icon = meta.icon; return <div className="mini-agent" key={agent.id}><div className={`mini-agent-icon ${meta.tone}`}><Icon size={15}/></div><div><b>{agent.name.replace(' Agent', '')}</b><span>{run ? run.summary : 'Standing by for a task'}</span></div><span className={`mini-status ${run ? 'active' : ''}`} /></div>; })}</div><button className="panel-footer-link" onClick={() => onNavigate('agents')}>Open agent workspace <ArrowRight size={14}/></button></section></div>
    <section className="surface-panel recent-panel"><div className="panel-heading"><div><h3>Recently reported</h3><p>Latest items from the campus community</p></div><button className="text-action" onClick={() => onNavigate('items')}>Browse reports <ArrowRight size={14}/></button></div><div className="recent-item-grid">{fresh.map((item) => <ItemCard key={item.id} item={item} onOpen={onOpenItem}/>)}</div></section>
    <section className="surface-panel activity-panel"><div className="panel-heading"><div><h3>Agent activity</h3><p>A traceable log of autonomous work and human decisions</p></div><button className="text-action" onClick={() => onNavigate('agents')}>Full activity log <ArrowRight size={14}/></button></div>{recentRuns.length ? recentRuns.map((run) => <ActivityRow key={run.id} run={run}/>) : <EmptyState icon={Activity} title="No activity yet" message="Agent actions appear here as reports move through the system."/>}</section>
  </>;
}

function ItemsPage({ items, onOpenItem, onReport, onDelete }) {
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const filtered = useMemo(() => items.filter((item) => (type === 'all' || item.type === type) && (category === 'all' || item.category === category) && (!query || `${item.title} ${item.description} ${item.location} ${item.aiAttributes?.keywords?.join(' ') || ''}`.toLowerCase().includes(query.toLowerCase()))), [items, type, query, category]);
  return <><PageHeading eyebrow="CAMPUS INVENTORY" title="Lost & found reports" subtitle="Search, filter, and inspect every report with its AI-extracted attributes." right={<Button onClick={onReport}><Plus size={16}/> New report</Button>}/><div className="filter-toolbar"><div className="segmented-tabs">{[['all','All reports'],['lost','Lost'],['found','Found']].map(([value,label]) => <button key={value} className={type === value ? 'selected' : ''} onClick={() => setType(value)}>{label}<span>{value === 'all' ? items.length : items.filter((item) => item.type === value).length}</span></button>)}</div><div className="filters-right"><div className="input-with-icon"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items, features, location…"/></div><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{CATEGORIES.map((entry) => <option key={entry}>{entry}</option>)}</select></div></div>{filtered.length ? <><div className="result-count">Showing <b>{filtered.length}</b> report{filtered.length === 1 ? '' : 's'} <span>·</span> Filters update instantly</div><div className="reports-grid">{filtered.map((item) => <ItemCard key={item.id} item={item} onOpen={onOpenItem} onDelete={onDelete}/>)}</div></> : <EmptyState icon={ListFilter} title="No reports match these filters" message="Try another keyword or reset the filters." action={<Button variant="outline" onClick={() => { setType('all'); setQuery(''); setCategory('all'); }}>Reset filters</Button>}/>}</>;
}

function MatchesPage({ matches, onOpenItem, onReview, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const filtered = matches.filter((match) => filter === 'all' || (filter === 'strong' && match.score >= 45) || (filter === 'reviewing' && match.status === 'reviewing') || (filter === 'suggested' && match.status === 'suggested'));
  return <><PageHeading eyebrow="MULTIMODAL RETRIEVAL" title="AI match centre" subtitle="Candidate pairs are ranked by attributes, text, date, and campus location. Similarity is a lead—not proof of ownership." right={<Button variant="outline" onClick={() => onNavigate('agents')}><Bot size={16}/> View agents</Button>}/><div className="callout callout-blue"><div className="callout-icon"><Lightbulb size={19}/></div><div><b>How the Matchmaking Agent thinks</b><p>It combines extracted visual attributes with descriptions and campus context. Every score is an explainable candidate ranking and requires human confirmation.</p></div></div><div className="filter-toolbar simple-toolbar"><div className="segmented-tabs">{[['all','All candidates'],['strong','Strong fit'],['suggested','Needs review'],['reviewing','In review']].map(([value,label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><span className="muted-copy"><SlidersHorizontal size={14}/>{filtered.length} pair{filtered.length === 1 ? '' : 's'}</span></div>{filtered.length ? <div className="match-list">{filtered.map((match) => <MatchCard key={match.id} match={match} onOpenItem={onOpenItem} onReview={onReview}/>)}</div> : <EmptyState icon={Target} title="Nothing in this queue" message="New reports are automatically compared against opposite-type items. You can also run the agent workspace." action={<Button onClick={() => onNavigate('agents')}>Open agent workspace</Button>}/>}</>;
}

function AgentsPage({ agents, runs, mode, onRunAll, onRunAgent, busy }) {
  return <><PageHeading eyebrow="ORCHESTRATION LAYER" title="Agent workspace" subtitle="Five focused agents coordinate perception, retrieval, safety and recovery—with a human in the loop." right={<Button onClick={onRunAll} disabled={busy}><RefreshCw size={16} className={busy ? 'spin' : ''}/> {busy ? 'Running agents…' : 'Run workflow'}</Button>}/><div className={`mode-banner ${mode?.mode === 'live' ? 'live-mode' : ''}`}><div className="mode-status-icon">{mode?.mode === 'live' ? <Zap size={17}/> : <Cpu size={17}/>}</div><div><b>{mode?.mode === 'live' ? `Live AI enabled${mode.model ? ` · ${mode.model}` : ''}` : 'Demo mode · rule-based matching'}</b><p>{mode?.mode === 'live' ? 'Image understanding and claim triage use your configured model. Matching ranks model-extracted attributes and report metadata.' : 'The app is fully usable with sample data. Add OPENAI_API_KEY in .env to activate live image understanding and natural-language assistant reasoning.'}</p></div><StatusPill tone={mode?.mode === 'live' ? 'mint' : 'amber'} dot>{mode?.mode === 'live' ? 'Connected' : 'Configure AI'}</StatusPill></div><div className="agent-grid">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} latestRun={runs.find((run) => run.agent === agent.name)} onRun={onRunAgent}/>)}</div><section className="surface-panel activity-log-panel"><div className="panel-heading"><div><h3>Execution trace</h3><p>Recent agent steps, outcomes, and run timing</p></div><span className="log-count">{runs.length} events</span></div>{runs.length ? runs.map((run) => <ActivityRow key={run.id} run={run}/>) : <EmptyState icon={Activity} title="No runs yet" message="Run the workflow to generate an execution trace."/>}</section><section className="human-loop-note"><div className="human-loop-icon"><Fingerprint size={22}/></div><div><b>Human-in-the-loop by design</b><p>Agents can prepare matches, rank evidence, and draft notifications. They never independently approve ownership claims or expose private identity details.</p></div></section></>;
}

function ClaimsPage({ claims, onDecision, onOpenItem }) {
  const [filter, setFilter] = useState('pending');
  const filtered = claims.filter((claim) => filter === 'all' || claim.status === filter);
  return <><PageHeading eyebrow="TRUST & VERIFICATION" title="Claim review queue" subtitle="AI can summarize evidence and surface missing details, but a person makes the final ownership decision."/><div className="filter-toolbar simple-toolbar"><div className="segmented-tabs">{[['pending','Needs review'],['approved','Approved'],['rejected','Rejected'],['all','All claims']].map(([value,label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}<span>{value === 'all' ? claims.length : claims.filter((claim) => claim.status === value).length}</span></button>)}</div></div><div className="claims-list">{filtered.length ? filtered.map((claim) => <article className="claim-card" key={claim.id}><div className="claim-head"><div className="claim-avatar">{(claim.claimantName || 'S').split(' ').map((word) => word[0]).slice(0,2).join('')}</div><div className="claim-head-copy"><b>{claim.claimantName}</b><span>{claim.claimantEmail} · {timeAgo(claim.createdAt)}</span></div><StatusPill tone={claim.status === 'approved' ? 'mint' : claim.status === 'rejected' ? 'rose' : 'amber'}>{claim.status}</StatusPill></div><div className="claim-item"><MiniItemImage item={claim.item}/><div><span className="eyebrow">CLAIM ON</span><button className="claim-item-title" onClick={() => onOpenItem(claim.item)}>{claim.item?.title || 'Deleted item'}</button><p>{claim.item?.location}</p></div></div><div className="claim-answer"><span><ShieldCheck size={13}/> PRIVATE VERIFICATION ANSWER</span><p>{claim.verificationAnswer}</p></div><div className="claim-assessment"><div className="assessment-top"><b><Sparkles size={14}/> Claim Safety Agent assessment</b><span>{Math.round((claim.assessment?.confidence || 0.5) * 100)}% evidence signal</span></div><div className="progress-track"><span style={{ width: `${Math.round((claim.assessment?.confidence || 0.5) * 100)}%` }}/></div><p>{claim.assessment?.note || 'No assessment available. Review the answer privately.'}</p>{(claim.assessment?.flags || []).map((flag) => <StatusPill key={flag} tone="amber">{flag}</StatusPill>)}</div>{claim.status === 'pending' && <div className="claim-actions"><Button variant="danger" onClick={() => onDecision(claim, 'rejected')}><XCircle size={15}/> Reject claim</Button><Button onClick={() => onDecision(claim, 'approved')}><CheckCircle2 size={15}/> Approve after review</Button></div>}</article>) : <EmptyState icon={FileCheck2} title="Queue is clear" message="There are no claims in this status. New claims will appear here for review."/>}</div></>;
}

function AnalyticsPage({ analytics, matches }) {
  const days = analytics.recentDays || [];
  const max = Math.max(1, ...days.map((day) => day.lost + day.found));
  const categories = Object.entries(analytics.categoryCounts || {}).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const locations = Object.entries(analytics.locationCounts || {}).sort((a,b) => b[1]-a[1]).slice(0, 5);
  return <><PageHeading eyebrow="CAMPUS INTELLIGENCE" title="Campus insights" subtitle="See demand patterns, find workflow gaps, and evaluate recovery activity from the current dataset." right={<StatusPill tone="mint" dot>Live local data</StatusPill>}/><div className="stats-grid analytics-stats"><StatCard label="Reports tracked" value={analytics.total ?? 0} icon={Package} tone="blue" detail="All report types"/><StatCard label="Candidate pairs" value={analytics.matchCount ?? matches.length} icon={Target} tone="violet" detail="Before owner confirmation"/><StatCard label="Claims received" value={analytics.claimCount ?? 0} icon={ShieldCheck} tone="amber" detail="All claim statuses"/><StatCard label="Agent events" value={analytics.runCount ?? 0} icon={Activity} tone="mint" detail="Execution trace entries"/></div><div className="content-grid insights-grid"><section className="surface-panel"><div className="panel-heading"><div><h3>Reports by day</h3><p>Lost and found reports by reported date · last seven days</p></div><span className="chart-legend"><i className="lost-legend"/> Lost <i className="found-legend"/> Found</span></div><div className="bar-chart">{days.map((day) => <div className="bar-day" key={day.date}><div className="bars"><div className="bar lost-bar" style={{height:`${Math.max(day.lost ? 8 : 2, day.lost / max * 148)}px`}} title={`${day.lost} lost`}/><div className="bar found-bar" style={{height:`${Math.max(day.found ? 8 : 2, day.found / max * 148)}px`}} title={`${day.found} found`}/></div><span>{day.label}</span></div>)}</div></section><section className="surface-panel"><div className="panel-heading"><div><h3>Category mix</h3><p>Most frequently reported item types</p></div></div><div className="horizontal-bars">{categories.map(([category,count], index) => <div className="horizontal-row" key={category}><div><span>{category}</span><b>{count}</b></div><div className="progress-track"><span style={{ width: `${Math.max(5, count / Math.max(1,categories[0]?.[1] || 1) * 100)}%`, background: ['#4778dc','#8e7aed','#41bda4','#e2a449','#df7f9a','#648da8'][index%6] }}/></div></div>)}</div></section></div><section className="surface-panel location-insight-panel"><div className="panel-heading"><div><h3>Where reports happen</h3><p>Use these signals to improve signage or designate campus collection points.</p></div><Map size={20} className="panel-heading-icon"/></div><div className="location-grid">{locations.map(([location,count],index) => <div className="location-card" key={location}><div className="location-rank">0{index+1}</div><div className="location-card-main"><b>{location}</b><span><MapPin size={12}/>{count} report{count===1?'':'s'}</span></div><div className="location-count-bar"><span style={{width:`${count / Math.max(1,locations[0]?.[1]||1) * 100}%`}}/></div></div>)}</div></section><div className="insight-footnote"><Lightbulb size={16}/><span>Insight quality depends on the reports entered. Sample data is provided for the demo; replace it with your campus dataset before making operational decisions.</span></div></>;
}

function NotificationsPage({ notifications, onRead, onNavigate }) {
  const unread = notifications.filter((entry) => !entry.read).length;
  const iconFor = (kind) => kind === 'claim' ? ShieldCheck : kind === 'match' ? Target : kind === 'recovery' ? CheckCircle2 : BellRing;
  return <><PageHeading eyebrow="ACTIVITY CENTRE" title="Notifications" subtitle="Match suggestions, claim decisions and workflow updates in one place." right={unread > 0 && <StatusPill tone="blue">{unread} unread</StatusPill>}/><div className="notification-list">{notifications.length ? notifications.map((notification) => { const Icon = iconFor(notification.kind); return <article className={`notification-row ${notification.read ? '' : 'unread'}`} key={notification.id}><div className={`notification-kind ${notification.kind || 'agent'}`}><Icon size={18}/></div><div className="notification-copy"><div className="notification-title-row"><b>{notification.title}</b>{!notification.read && <span className="unread-dot"/>}</div><p>{notification.message}</p><span>{timeAgo(notification.createdAt)}</span></div><div className="notification-actions">{notification.itemId && <Button size="sm" variant="ghost" onClick={() => onNavigate('items')}>Open reports</Button>}{!notification.read && <button className="icon-button" title="Mark read" onClick={() => onRead(notification)}><Check size={15}/></button>}</div></article>; }) : <EmptyState icon={Bell} title="You're all caught up" message="New match suggestions and claim updates will show here."/>}</div></>;
}

function ReportModal({ open, onClose, onSubmit, busy, seed }) {
  const [form, setForm] = useState({ type: 'lost', title: '', description: '', category: 'Electronics', location: '', itemDate: new Date().toISOString().slice(0,10), ownerName: 'Campus Student', ownerEmail: '', contactInfo: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setError(''); setForm((current) => ({ ...current, type: seed?.type || 'lost', category: seed?.category || current.category, title: seed?.title || '', description: seed?.description || '', location: seed?.location || '', itemDate: new Date().toISOString().slice(0,10) })); setFile(null); setPreview(''); setAnalysis(null); } }, [open, seed]);
  if (!open) return null;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const chooseFile = (selected) => {
    if (!selected) return;
    if (!selected.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    if (selected.size > 5 * 1024 * 1024) { setError('Image must be 5 MB or smaller.'); return; }
    setError(''); setFile(selected); setAnalysis(null);
    const reader = new FileReader(); reader.onload = () => setPreview(String(reader.result)); reader.readAsDataURL(selected);
  };
  const analyze = async () => {
    if (!file) { setError('Choose a photo before asking the visual agent to analyze it.'); return; }
    setAnalyzing(true); setError('');
    try {
      const body = new FormData(); body.append('image', file); body.append('title', form.title); body.append('description', form.description); body.append('category', form.category);
      const result = await api('/ai/identify', { method: 'POST', body });
      const item = result.attributes || {};
      setAnalysis(result);
      setForm((current) => ({ ...current, title: current.title || item.title || '', description: current.description || item.visualSummary || '', category: CATEGORIES.includes(item.category) ? item.category : current.category }));
    } catch (err) { setError(err.message); }
    finally { setAnalyzing(false); }
  };
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (form.title.trim().length < 3 || form.description.trim().length < 10 || form.location.trim().length < 2 || !form.ownerEmail.includes('@')) { setError('Add a title, a 10+ character description, campus location and valid demo email.'); return; }
    const body = new FormData(); Object.entries(form).forEach(([key,value]) => body.append(key, value)); if (file) body.append('image', file);
    try { await onSubmit(body); onClose(); } catch (err) { setError(err.message); }
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal report-modal"><div className="modal-head"><div><div className="eyebrow">NEW CAMPUS REPORT</div><h2>Help an item find its way home</h2><p>Add a few details. The agents will look for possible matches.</p></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><form onSubmit={submit}><div className="report-type-select"><button type="button" className={form.type==='lost'?'active lost-active':''} onClick={() => update('type','lost')}><Search size={17}/><span><b>I lost something</b><small>Find a possible match</small></span>{form.type==='lost'&&<CheckCircle2 size={17}/>}</button><button type="button" className={form.type==='found'?'active found-active':''} onClick={() => update('type','found')}><Package size={17}/><span><b>I found something</b><small>Help return an item</small></span>{form.type==='found'&&<CheckCircle2 size={17}/>}</button></div><div className="form-grid"><label className="form-field full"><span>Item title <i>*</i></span><input value={form.title} onChange={(e) => update('title',e.target.value)} placeholder="e.g. Black wireless earbuds case" maxLength={120} required/></label><label className="form-field full"><span>Description <i>*</i></span><textarea value={form.description} onChange={(e) => update('description',e.target.value)} placeholder="Color, shape, distinguishing features — anything useful…" rows={3} maxLength={2000} required/></label><label className="form-field"><span>Category <i>*</i></span><select value={form.category} onChange={(e) => update('category',e.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="form-field"><span>Date {form.type==='lost'?'lost':'found'} <i>*</i></span><input type="date" value={form.itemDate} onChange={(e) => update('itemDate',e.target.value)} required/></label><label className="form-field full"><span>Campus location <i>*</i></span><div className="field-with-icon"><MapPin size={16}/><input value={form.location} onChange={(e) => update('location',e.target.value)} placeholder="Library · 2nd floor" maxLength={160} required/></div></label></div><div className="upload-section"><div className="upload-label-row"><div><b>Item photo</b><span>JPG, PNG or WEBP · Max 5 MB</span></div>{file && <button type="button" className="text-action" onClick={() => {setFile(null);setPreview('');setAnalysis(null);}}>Remove photo</button>}</div>{preview ? <div className="photo-preview"><img src={preview} alt="Selected item preview"/><div className="photo-preview-meta"><span><FileImage size={14}/>{file?.name}</span><Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Change</Button></div></div> : <button type="button" className="upload-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }}><div className="upload-icon"><CloudUpload size={24}/></div><b>Drop your image here or browse</b><span>A clear photo helps the visual agent extract useful features</span></button>}<input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => chooseFile(e.target.files?.[0])}/>{file && <div className="analysis-controls"><Button type="button" variant="soft" onClick={analyze} disabled={analyzing}><WandSparkles size={15}/>{analyzing?'Analyzing photo…':'Identify with AI'}</Button>{analysis && <StatusPill tone={analysis.mode==='live'?'mint':'amber'}>{analysis.mode==='live'?'Live model':'Demo analysis'}</StatusPill>}</div>}{analysis && <div className="analysis-result"><div className="analysis-result-head"><Sparkles size={15}/><b>Visual agent findings</b><span>{Math.round((analysis.attributes?.confidence||0)*100)}% confidence</span></div><p>{analysis.attributes?.visualSummary}</p><div className="attribute-chips">{[analysis.attributes?.object,analysis.attributes?.color,...(analysis.attributes?.visibleFeatures||[]).slice(0,3)].filter(Boolean).map((attribute) => <span key={attribute}>{attribute}</span>)}</div>{analysis.warning && <small>{analysis.warning}</small>}</div>}</div><div className="form-divider"/><div className="form-grid"><label className="form-field"><span>Your name <i>*</i></span><input value={form.ownerName} onChange={(e) => update('ownerName',e.target.value)} required/></label><label className="form-field"><span>Campus email <i>*</i></span><input type="email" value={form.ownerEmail} onChange={(e) => update('ownerEmail',e.target.value)} placeholder="you@campus.edu" required/></label><label className="form-field full"><span>Private contact (optional)</span><input value={form.contactInfo} onChange={(e) => update('contactInfo',e.target.value)} placeholder="Phone / email (not shown on public cards)" maxLength={160}/></label></div><div className="modal-foot"><span><ShieldCheck size={14}/> Local demo only: add authentication and access controls before using real student information.</span><div><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy?<><LoaderCircle size={15} className="spin"/> Saving report</>:<><Plus size={16}/> Submit report</>}</Button></div></div>{error && <div className="form-error"><AlertTriangle size={15}/>{error}</div>}</form></div></div>;
}

function ItemDetailModal({ item, matches, onClose, onClaim, onReview, onDelete, onReport }) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [form, setForm] = useState({ claimantName: '', claimantEmail: '', verificationAnswer: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!item) return null;
  const related = matches.filter((match) => match.lostItemId === item.id || match.foundItemId === item.id).slice(0,3);
  const update = (key,value) => setForm((current) => ({...current,[key]:value}));
  const submitClaim = async (event) => { event.preventDefault(); setBusy(true);setError('');try {await onClaim({...form,itemId:item.id});setClaimOpen(false);}catch(err){setError(err.message);}finally{setBusy(false);}};
  return <div className="modal-backdrop" onMouseDown={(e) => e.target===e.currentTarget&&onClose()}><div className="modal detail-modal"><div className="modal-head"><div><div className="eyebrow">REPORT DETAILS</div><h2>{item.title}</h2><p>Reported {dateLabel(item.itemDate)} · {item.category}</p></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="detail-layout"><div><MiniItemImage item={item} className="detail-image"/><div className="detail-image-privacy"><ShieldCheck size={13}/> Sensitive details are never shown publicly.</div></div><div className="detail-data"><div className="detail-chip-row"><span className={`type-chip ${item.type}`}>{item.type==='lost'?'Lost item':'Found item'}</span><StatusPill tone={item.status==='open'?'mint':'neutral'}>{item.status}</StatusPill></div><p className="detail-description">{item.description}</p><div className="detail-fact"><MapPin size={16}/><span><small>LAST SEEN / FOUND AT</small><b>{item.location}</b></span></div><div className="detail-fact"><CalendarDays size={16}/><span><small>DATE REPORTED</small><b>{dateLabel(item.itemDate)}</b></span></div>{item.aiAttributes && <div className="detail-ai"><div><Sparkles size={15}/><b>Visual identification</b><StatusPill tone={item.aiAttributes.source==='openai'?'mint':'amber'}>{item.aiAttributes.source==='openai'?'Live AI':'Demo'}</StatusPill></div><p>{item.aiAttributes.visualSummary}</p><div className="attribute-chips">{[item.aiAttributes.object,item.aiAttributes.color,...(item.aiAttributes.visibleFeatures||[]).slice(0,3)].filter(Boolean).map((entry)=><span key={entry}>{entry}</span>)}</div></div>}{item.status==='open'&&<div className="detail-actions">{!claimOpen&&item.type==='found'&&<Button onClick={() => setClaimOpen(true)}><ShieldCheck size={15}/> Claim this item</Button>}{!claimOpen&&item.type==='lost'&&<Button onClick={() => { onClose(); onReport?.({ type: 'found', category: item.category }); }}><Plus size={15}/> Report a possible find</Button>}{onDelete&&<Button variant="ghost" onClick={() => onDelete(item)}><Trash2 size={15}/> Delete report</Button>}</div>}</div></div>{related.length>0&&<div className="detail-related"><h3><Target size={15}/> Related AI match candidates</h3>{related.map((match)=><div className="detail-match-row" key={match.id}><span className="fit-score">{match.score}%</span><div><b>{match.lostItem.title}</b><ArrowRight size={12}/><b>{match.foundItem.title}</b><small>{(match.reasons||[]).slice(0,2).join(' · ')}</small></div><Button size="sm" variant="outline" onClick={()=>onReview(match,'reviewing')}>Review</Button></div>)}</div>}{claimOpen&&<form className="claim-form" onSubmit={submitClaim}><div className="claim-form-head"><h3>Submit an ownership claim</h3><button type="button" className="icon-button" onClick={()=>setClaimOpen(false)}><X size={16}/></button></div><div className="form-grid"><label className="form-field"><span>Your name *</span><input value={form.claimantName} onChange={(e)=>update('claimantName',e.target.value)} required/></label><label className="form-field"><span>Campus email *</span><input type="email" value={form.claimantEmail} onChange={(e)=>update('claimantEmail',e.target.value)} required/></label><label className="form-field full"><span>Private identifying detail *</span><textarea rows={3} value={form.verificationAnswer} onChange={(e)=>update('verificationAnswer',e.target.value)} minLength={10} placeholder="Describe a detail that only the true owner would know. Do not share passwords or ID numbers." required/></label></div><div className="claim-form-note"><AlertTriangle size={14}/> Demo note: this is a local prototype without sign-in. Do not enter real private details.</div>{error&&<div className="form-error">{error}</div>}<div className="claim-form-buttons"><Button type="button" variant="ghost" onClick={()=>setClaimOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Submitting…':'Submit claim'}</Button></div></form>}</div></div>;
}

function AssistantWidget({ onClose, mode }) {
  const [messages, setMessages] = useState([{ role:'assistant', text:'Hi! I’m CampusConnect AI. Ask me to search campus reports, summarize possible matches, or find patterns in the current dataset.' }]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'});},[messages,busy]);
  const send = async (event) => {event?.preventDefault();const text=value.trim();if(!text||busy)return;setValue('');setMessages((current)=>[...current,{role:'user',text}]);setBusy(true);try{const answer=await api('/assistant',jsonBody({message:text}));setMessages((current)=>[...current,{role:'assistant',text:answer.answer,source:answer.source}]);}catch(error){setMessages((current)=>[...current,{role:'assistant',text:error.message}]);}finally{setBusy(false);}};
  return <div className="assistant-panel"><div className="assistant-head"><div className="assistant-avatar"><Sparkles size={17}/></div><div><b>Campus AI copilot</b><span><i/> {mode==='live'?'Live reasoning enabled':'Demo search mode'}</span></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="assistant-context"><span><Command size={13}/> CAMPUS REPORTS</span><span>Connected</span></div><div className="assistant-messages">{messages.map((message,index)=><div className={`chat-message ${message.role}`} key={index}><div className="chat-bubble">{message.text.split('\n').map((line,lineIndex)=><span key={lineIndex}>{line}{lineIndex<message.text.split('\n').length-1&&<br/>}</span>)}</div>{message.role==='assistant'&&message.source&&<small>{message.source==='openai'?'AI reasoning':'Data-grounded demo response'}</small>}</div>)}{busy&&<div className="chat-message assistant"><div className="chat-bubble typing"><i/><i/><i/></div></div>}<div ref={endRef}/></div><div className="assistant-suggestions">{['What matches need review?','Which locations have reports?'].map((q)=><button key={q} onClick={()=>setValue(q)}>{q}</button>)}</div><form className="assistant-input" onSubmit={send}><input value={value} onChange={(e)=>setValue(e.target.value)} placeholder="Ask about campus reports…"/><Button type="submit" size="icon" disabled={!value.trim()||busy}><Send size={16}/></Button></form><div className="assistant-disclaimer">AI suggestions can be wrong. Verify details before any hand-off.</div></div>;
}

export default function App() {
  const [page, setPage] = useState('overview');
  const [dashboard, setDashboard] = useState({});
  const [items, setItems] = useState([]);
  const [matches, setMatches] = useState([]);
  const [claims, setClaims] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [agents, setAgents] = useState([]);
  const [runs, setRuns] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [health, setHealth] = useState({mode:'demo',enabled:false});
  const [dataLoading, setDataLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSeed, setReportSeed] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const toastRef = useRef(null);

  const notify = useCallback((message, kind='success') => {setToast({message,kind});if(toastRef.current)clearTimeout(toastRef.current);toastRef.current=setTimeout(()=>setToast(null),3800);},[]);
  const refresh = useCallback(async ({initial=false}={}) => {
    if(initial)setDataLoading(true);
    try {
      const [healthData,dashData,itemData,matchData,claimData,notifData,agentData,analyticsData] = await Promise.all([
        api('/health'),api('/dashboard'),api('/items'),api('/matches'),api('/claims'),api('/notifications'),api('/agents'),api('/analytics')
      ]);
      setHealth(healthData);setDashboard(dashData);setItems(itemData.items||[]);setMatches(matchData.matches||[]);setClaims(claimData.claims||[]);setNotifications(notifData.notifications||[]);setAgents(agentData.agents||[]);setRuns(agentData.runs||[]);setAnalytics(analyticsData);
    } catch(error) { notify(`Couldn't load the local API: ${error.message}. Make sure both app services are running.`, 'error'); }
    finally {setDataLoading(false);}
  },[notify]);
  useEffect(()=>{refresh({initial:true});return()=>{if(toastRef.current)clearTimeout(toastRef.current);};},[refresh]);

  const navigate = (next) => {setPage(next);setMobileNav(false);if(next==='items'&&search) setSearch(search);};
  const openReport = (seed = null) => { setReportSeed(seed); setReportOpen(true); };
  const createReport = async (body) => {
    setReportBusy(true);
    try { const result = await api('/items',{method:'POST',body}); await refresh();setPage('matches');notify(result.mode==='live'?'Report saved. Live visual analysis and agent matching completed.':'Report saved. Demo matching pipeline ran; configure an API key for live image understanding.');if(result.warning)notify(result.warning,'info'); }
    finally {setReportBusy(false);}
  };
  const createClaim = async (body) => {const result=await api('/claims',jsonBody(body));await refresh();notify(`Claim submitted. Safety assessment: ${Math.round((result.claim.assessment?.confidence||0)*100)}% evidence signal; human review required.`);};
  const decideClaim = async (claim,status) => {try{await api(`/claims/${claim.id}`,{...jsonBody({status}),method:'PATCH'});await refresh();notify(`Claim ${status}. ${status==='approved'?'Coordinate a safe hand-off.':'The review decision has been recorded.'}`);}catch(error){notify(error.message,'error');}};
  const reviewMatch = async (match,status) => {try{await api(`/matches/${match.lostItemId}/${match.foundItemId}/review`,jsonBody({status}));await refresh();notify(`Match moved to ${status}.`);}catch(error){notify(error.message,'error');}};
  const readNotification = async (notification) => {try{await api(`/notifications/${notification.id}/read`,{method:'POST'});await refresh();}catch(error){notify(error.message,'error');}};
  const runAll = async () => {setWorkflowBusy(true);try{const result=await api('/agents/run',jsonBody({scope:'all'}));await refresh();notify(`Workflow complete. ${result.processed} report(s) processed; ${result.matches} candidate pairs found.`);}catch(error){notify(error.message,'error');}finally{setWorkflowBusy(false);}};
  const runAgent = async (agent) => {if(agent.name==='Visual Identification Agent'){const latest=items.find((item)=>item.imageUrl?.startsWith('/uploads/'));if(!latest){notify('Add a photo report first to run live visual identification.','info');return;}try{await api(`/items/${latest.id}/reprocess`,jsonBody({}));await refresh();notify('Visual identification and matching completed for the latest uploaded photo.');}catch(error){notify(error.message,'error');}return;}await runAll();};
  const deleteItem = async (item) => {if(!window.confirm(`Delete “${item.title}” from the local demo dataset?`))return;try{await api(`/items/${item.id}`,{method:'DELETE'});setSelectedItem(null);await refresh();notify('Report deleted.');}catch(error){notify(error.message,'error');}};
  const openItem = (item) => setSelectedItem(item);
  const unread = notifications.filter((entry)=>!entry.read).length;
  const pageTitles = {overview:'Overview',items:'Lost & found',matches:'AI match centre',agents:'Agent workspace',claims:'Claim review',analytics:'Campus insights',notifications:'Notifications'};

  const currentPage = () => {
    if(page==='overview')return <OverviewPage dashboard={dashboard} items={items} matches={matches} agents={agents} runs={runs} onReport={openReport} onOpenItem={openItem} onReview={reviewMatch} onNavigate={navigate} onRunAll={runAll}/>;
    if(page==='items')return <ItemsPage items={items.filter((item)=>!search||`${item.title} ${item.description} ${item.location}`.toLowerCase().includes(search.toLowerCase()))} onOpenItem={openItem} onReport={openReport} onDelete={deleteItem}/>;
    if(page==='matches')return <MatchesPage matches={matches} onOpenItem={openItem} onReview={reviewMatch} onNavigate={navigate}/>;
    if(page==='agents')return <AgentsPage agents={agents} runs={runs} mode={health} onRunAll={runAll} onRunAgent={runAgent} busy={workflowBusy}/>;
    if(page==='claims')return <ClaimsPage claims={claims} onDecision={decideClaim} onOpenItem={openItem}/>;
    if(page==='analytics')return <AnalyticsPage analytics={analytics} matches={matches}/>;
    if(page==='notifications')return <NotificationsPage notifications={notifications} onRead={readNotification} onNavigate={navigate}/>;
    return null;
  };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}><div className="brand-lockup"><div className="brand-mark"><GraduationCap size={24}/><span/></div><div><b>campusconnect<span>.</span></b><small>AI RECOVERY PLATFORM</small></div><button className="mobile-close icon-button" onClick={()=>setMobileNav(false)}><X size={18}/></button></div><div className="workspace-switcher"><div className="workspace-avatar"><GraduationCap size={17}/></div><div><b>University Campus</b><small>Student workspace</small></div><ChevronDown size={15}/></div><div className="nav-caption">WORKSPACE</div><nav className="main-nav">{NAV.slice(0,4).map((entry)=>{const Icon=entry.icon;return <button key={entry.id} className={`nav-item ${page===entry.id?'active':''}`} onClick={()=>navigate(entry.id)}><Icon size={18}/><span>{entry.label}</span>{entry.badge&&matches.filter((match)=>match.status==='suggested').length>0&&<i className="nav-count">{matches.filter((match)=>match.status==='suggested').length}</i>}</button>;})}</nav><div className="nav-caption nav-caption-gap">OPERATIONS</div><nav className="main-nav">{NAV.slice(4).map((entry)=>{const Icon=entry.icon;return <button key={entry.id} className={`nav-item ${page===entry.id?'active':''}`} onClick={()=>navigate(entry.id)}><Icon size={18}/><span>{entry.label}</span>{entry.id==='notifications'&&unread>0&&<i className="nav-count">{unread}</i>}</button>;})}</nav><div className="sidebar-spacer"/><div className="sidebar-agent-card"><div className="sidebar-agent-top"><div className="tiny-orbit"><Sparkles size={14}/></div><span><i/> SYSTEM {health.mode==='live'?'LIVE':'READY'}</span></div><b>{health.mode==='live'?'Live AI is connected':'Your agent network is ready'}</b><p>{health.mode==='live'?'Vision and reasoning are available for new tasks.':'Run a workflow to find candidate matches across your reports.'}</p><button onClick={()=>navigate('agents')}>Agent workspace <ArrowUpRight size={13}/></button></div><div className="sidebar-user"><div className="user-avatar">CA</div><div><b>Campus Admin</b><span>Demo coordinator</span></div><MoreHorizontal size={18}/></div></aside>
    {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    <div className="app-main"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><div className="breadcrumb"><span>Campus workspace</span><ChevronRight size={14}/><b>{pageTitles[page]}</b></div></div><div className="topbar-right"><div className="topbar-search"><Search size={16}/><input value={search} onChange={(e)=>{setSearch(e.target.value);if(e.target.value)setPage('items');}} placeholder="Search reports…"/><kbd>⌘ K</kbd></div><div className={`ai-mode-chip ${health.mode==='live'?'live':''}`}><span className="live-dot"/>{health.mode==='live'?'AI connected':'Demo mode'}</div><button className="topbar-notification icon-button" onClick={()=>navigate('notifications')} title="Notifications"><Bell size={19}/>{unread>0&&<i/>}</button><div className="topbar-avatar">CA</div></div></header><main className="page-content">{dataLoading?<div className="loading-state"><div className="loading-mark"><Sparkles size={22}/></div><b>Preparing your campus workspace</b><span>Loading reports, matches, and agent activity…</span><div className="loading-line"><i/></div></div>:currentPage()}</main><footer className="app-footer"><span>CampusConnect AI <span>•</span> Multimodal agentic recovery</span><span><ShieldCheck size={13}/> Privacy-first · Human-approved hand-offs</span></footer></div>
    <Button variant="assistant-fab" className={assistantOpen?'assistant-fab-open':''} onClick={()=>setAssistantOpen((value)=>!value)}><span className="fab-spark"><Sparkles size={17}/></span>{assistantOpen?'Close copilot':'Ask Campus AI'}{assistantOpen?<X size={15}/>:<MessageCircle size={16}/>}</Button>{assistantOpen&&<AssistantWidget onClose={()=>setAssistantOpen(false)} mode={health.mode}/>}
    <ReportModal open={reportOpen} onClose={()=>setReportOpen(false)} onSubmit={createReport} busy={reportBusy} seed={reportSeed}/><ItemDetailModal item={selectedItem} matches={matches} onClose={()=>setSelectedItem(null)} onClaim={createClaim} onReview={reviewMatch} onDelete={deleteItem} onReport={openReport}/>
    {toast&&<div className={`toast-message ${toast.kind}`}><span>{toast.kind==='error'?<AlertTriangle size={17}/>:toast.kind==='info'?<CircleHelp size={17}/>:<CheckCircle2 size={17}/>}</span><p>{toast.message}</p><button onClick={()=>setToast(null)}><X size={14}/></button></div>}
  </div>;
}
