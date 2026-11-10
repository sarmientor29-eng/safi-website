// Illustrative UI policy only. Real authorization MUST be enforced by the server.
export function canAccess({role,assignedProjects=[]},project,action){if(typeof project!=="string"||!project)return false;if(role==="admin")return ["view","review"].includes(action);if(role==="manager")return assignedProjects.includes(project)&&["view","review"].includes(action);if(role==="worker")return assignedProjects.includes(project)&&action==="view-own";return false}
export function visibleFor(user,items){return items.filter(item=>canAccess(user,item.project,"view"))}
export function reviewAllowed(user,item){return item.status==="received"&&canAccess(user,item.project,"review")}
