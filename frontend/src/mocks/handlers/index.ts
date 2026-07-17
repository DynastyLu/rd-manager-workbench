import { authHandlers } from './auth'
import { usersHandlers } from './users'
import { ocrHandlers } from './ocr'

export const handlers = [...authHandlers, ...usersHandlers, ...ocrHandlers]
