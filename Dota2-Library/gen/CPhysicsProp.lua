---@diagnostic disable: lowercase-global, missing-return

---@class CPhysicsProp : CBaseAnimatingActivity
_G.CPhysicsProp = {}

--- Disable motion for the prop.  
--- Env: only in `server`
---@return nil
function CPhysicsProp:DisableMotion() end

--- Enable motion for the prop.  
--- Env: only in `server`
---@return nil
function CPhysicsProp:EnableMotion() end

