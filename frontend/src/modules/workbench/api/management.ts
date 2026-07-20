import { request } from '@/lib/http'
import type {
  AgreementStatus,
  CommunicationRecord,
  CommunicationType,
  Decision,
  Issue,
  Meeting,
  MeetingAction,
  Paginated,
  Partner,
  PartnerAgreement,
  PartnerContact,
  PartnerProject,
  Risk,
  WorkTask,
} from '../types'

type Params = Record<string, string | number | boolean | undefined>
const query = (params: Params = {}) => { const value = new URLSearchParams(); Object.entries(params).forEach(([key, item]) => { if (item !== undefined) value.set(key, String(item)) }); const rendered=value.toString(); return rendered ? `?${rendered}` : '' }
const child = (parent:string, id:string) => `${parent}/${encodeURIComponent(id)}`
export type CreateSourceTaskInput = { title:string; description?:string; projectId?:string; assigneeName?:string; dueAt?:string; priority?:string }
export const listRisks=(p:Params={})=>request<Paginated<Risk>>(`/risks${query(p)}`); export const getRisk=(id:string)=>request<Risk>(child('/risks',id)); export const createRisk=(input:Partial<Risk>&{title:string;likelihood:string;impact:string;level:string})=>request<Risk>('/risks',{method:'POST',body:JSON.stringify(input)}); export const updateRisk=(id:string,input:Partial<Risk>)=>request<Risk>(child('/risks',id),{method:'PATCH',body:JSON.stringify(input)}); export const archiveRisk=(id:string)=>request<void>(child('/risks',id),{method:'DELETE'});
export const listIssues=(p:Params={})=>request<Paginated<Issue>>(`/issues${query(p)}`); export const getIssue=(id:string)=>request<Issue>(child('/issues',id)); export const createIssue=(input:Partial<Issue>&{title:string})=>request<Issue>('/issues',{method:'POST',body:JSON.stringify(input)}); export const updateIssue=(id:string,input:Partial<Issue>)=>request<Issue>(child('/issues',id),{method:'PATCH',body:JSON.stringify(input)}); export const archiveIssue=(id:string)=>request<void>(child('/issues',id),{method:'DELETE'});
export const listDecisions=(p:Params={})=>request<Paginated<Decision>>(`/decisions${query(p)}`); export const getDecision=(id:string)=>request<Decision>(child('/decisions',id)); export const createDecision=(input:Partial<Decision>&{title:string;alternatives:string[]})=>request<Decision>('/decisions',{method:'POST',body:JSON.stringify(input)}); export const updateDecision=(id:string,input:Partial<Decision>)=>request<Decision>(child('/decisions',id),{method:'PATCH',body:JSON.stringify(input)}); export const archiveDecision=(id:string)=>request<void>(child('/decisions',id),{method:'DELETE'}); export const createDecisionTask=(id:string,input:CreateSourceTaskInput)=>request<WorkTask>(`${child('/decisions',id)}/task`,{method:'POST',body:JSON.stringify(input)});
export interface ListPartnersParams extends Params {
  q?: string
  projectId?: string
  nextFollowUpBefore?: string
  nextFollowUpFrom?: string
  page?: number
  pageSize?: number
}

export interface CreatePartnerInput {
  name: string
  shortName?: string
  category?: string
  address?: string
  notes?: string
  projectIds?: string[]
}

export interface UpdatePartnerInput {
  name?: string
  shortName?: string | null
  category?: string | null
  address?: string | null
  notes?: string | null
  projectIds?: string[]
}

export interface CreatePartnerContactInput {
  name: string
  title?: string
  phone?: string
  email?: string
  notes?: string
}

export interface UpdatePartnerContactInput {
  name?: string
  title?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

export interface CreatePartnerAgreementInput {
  title: string
  agreementNo?: string
  status?: AgreementStatus
  startAt?: string
  endAt?: string
  notes?: string
}

export interface UpdatePartnerAgreementInput {
  title?: string
  agreementNo?: string | null
  status?: AgreementStatus
  startAt?: string | null
  endAt?: string | null
  notes?: string | null
}

export interface CreateCommunicationInput {
  type: CommunicationType
  occurredAt: string
  subject: string
  projectId?: string
  contactId?: string
  summary?: string
  promises?: string
  ownerName?: string
  nextFollowUpAt?: string
}

export interface UpdateCommunicationInput {
  type?: CommunicationType
  occurredAt?: string
  subject?: string
  projectId?: string | null
  contactId?: string | null
  summary?: string | null
  promises?: string | null
  ownerName?: string | null
  nextFollowUpAt?: string | null
}

export interface PartnerProjectInput {
  role?: string
  notes?: string
}

export interface SourceTaskResult {
  task: WorkTask
  alreadyExists: boolean
}

export const listPartners = (params: ListPartnersParams = {}) =>
  request<Paginated<Partner>>(`/partners${query(params)}`)
export const getPartner = (id: string) => request<Partner>(child('/partners', id))
export const createPartner = (input: CreatePartnerInput) =>
  request<Partner>('/partners', { method: 'POST', body: JSON.stringify(input) })
export const updatePartner = (id: string, input: UpdatePartnerInput) =>
  request<Partner>(child('/partners', id), { method: 'PATCH', body: JSON.stringify(input) })
export const archivePartner = (id: string) =>
  request<void>(child('/partners', id), { method: 'DELETE' })

const partnerChild = (partnerId: string, collection: string, childId?: string) => {
  const base = `${child('/partners', partnerId)}/${collection}`
  return childId ? `${base}/${encodeURIComponent(childId)}` : base
}

export const createContact = (partnerId: string, input: CreatePartnerContactInput) =>
  request<PartnerContact>(partnerChild(partnerId, 'contacts'), {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const updateContact = (
  partnerId: string,
  id: string,
  input: UpdatePartnerContactInput,
) =>
  request<PartnerContact>(partnerChild(partnerId, 'contacts', id), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
export const archiveContact = (partnerId: string, id: string) =>
  request<void>(partnerChild(partnerId, 'contacts', id), { method: 'DELETE' })

export const createAgreement = (partnerId: string, input: CreatePartnerAgreementInput) =>
  request<PartnerAgreement>(partnerChild(partnerId, 'agreements'), {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const updateAgreement = (
  partnerId: string,
  id: string,
  input: UpdatePartnerAgreementInput,
) =>
  request<PartnerAgreement>(partnerChild(partnerId, 'agreements', id), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
export const archiveAgreement = (partnerId: string, id: string) =>
  request<void>(partnerChild(partnerId, 'agreements', id), { method: 'DELETE' })

export const listCommunications = (partnerId: string, params: Params = {}) =>
  request<Paginated<CommunicationRecord>>(
    `${partnerChild(partnerId, 'communications')}${query(params)}`,
  )
export const createCommunication = (partnerId: string, input: CreateCommunicationInput) =>
  request<CommunicationRecord>(partnerChild(partnerId, 'communications'), {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const updateCommunication = (
  partnerId: string,
  id: string,
  input: UpdateCommunicationInput,
) =>
  request<CommunicationRecord>(partnerChild(partnerId, 'communications', id), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
export const archiveCommunication = (partnerId: string, id: string) =>
  request<void>(partnerChild(partnerId, 'communications', id), { method: 'DELETE' })
export const createCommunicationTask = (id: string, input: CreateSourceTaskInput) =>
  request<SourceTaskResult>(`${child('/communications', id)}/task`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const linkPartnerProject = (
  partnerId: string,
  projectId: string,
  input: PartnerProjectInput = {},
) =>
  request<PartnerProject>(partnerChild(partnerId, 'projects', projectId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const unlinkPartnerProject = (partnerId: string, projectId: string) =>
  request<void>(partnerChild(partnerId, 'projects', projectId), { method: 'DELETE' })
export interface MeetingMinutesDocument {
  id: string
  title: string
  type: 'MEETING_MINUTES'
  plainText?: string | null
  content?: unknown
}

export interface MeetingActionTaskResult {
  task: WorkTask
  alreadyExists: boolean
}

export const listMeetings = (params: Params = {}) =>
  request<Paginated<Meeting>>(`/meetings${query(params)}`)
export const getMeeting = (id: string) => request<Meeting>(child('/meetings', id))
export const createMeeting = (input: Partial<Meeting> & { title: string; scheduledAt: string }) =>
  request<Meeting>('/meetings', { method: 'POST', body: JSON.stringify(input) })
export const updateMeeting = (id: string, input: Partial<Meeting>) =>
  request<Meeting>(child('/meetings', id), { method: 'PATCH', body: JSON.stringify(input) })
export const archiveMeeting = (id: string) =>
  request<void>(child('/meetings', id), { method: 'DELETE' })
export const createMeetingAgendaItem = (
  id: string,
  input: { title: string; description?: string; sequence?: number },
) =>
  request(`${child('/meetings', id)}/agenda-items`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const createMeetingAction = (
  id: string,
  input: Partial<MeetingAction> & { title: string },
) =>
  request<MeetingAction>(`${child('/meetings', id)}/actions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const updateMeetingAction = (
  meetingId: string,
  id: string,
  input: Partial<MeetingAction>,
) =>
  request<MeetingAction>(`${child('/meetings', meetingId)}/actions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
export const createMeetingActionTask = (id: string, input: CreateSourceTaskInput) =>
  request<MeetingActionTaskResult>(`${child('/meeting-actions', id)}/task`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const createMeetingMinutesDocument = (id: string) =>
  request<MeetingMinutesDocument>(`${child('/meetings', id)}/minutes-document`, {
    method: 'POST',
  })
