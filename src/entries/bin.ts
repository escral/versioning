#!/usr/bin/env node

import { runMain } from 'citty'
import { createVersionCommand } from '../command'

// noinspection JSIgnoredPromiseFromCall
runMain(createVersionCommand())
