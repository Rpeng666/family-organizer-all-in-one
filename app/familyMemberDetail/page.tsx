'use client'

import React, { useState } from 'react';
import FamilyAllowanceView from '@/components/allowance/FamilyAllowanceView';
import { OpenLinkedThreadButton } from '@/components/messages/OpenLinkedThreadButton';


function App() {
 
  return (
    <div className="space-y-4 p-4">
        <div className="flex justify-end">
            <OpenLinkedThreadButton linkedDomain="finance" linkedEntityId="finance-board" title="Family Finance" />
        </div>
        <FamilyAllowanceView />
    </div>
  )
}


export default App
