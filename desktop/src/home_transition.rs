//! Native hide deadlines do not depend on the WebView's animation/frame clock.
use std::sync::Mutex;
pub const EXIT_MILLIS:u64=280;
#[derive(Default)]struct State{generation:u64,leaving:bool}
#[derive(Default)]pub struct HomeTransition(Mutex<State>);
impl HomeTransition{
 pub fn begin(&self)->Option<u64>{let mut s=self.0.lock().unwrap();if s.leaving{return None;}s.generation+=1;s.leaving=true;Some(s.generation)}
 pub fn cancel(&self)->bool{let mut s=self.0.lock().unwrap();let leaving=s.leaving;s.generation+=1;s.leaving=false;leaving}
 pub fn generation(&self)->u64{self.0.lock().unwrap().generation}
 pub fn is_leaving(&self)->bool{self.0.lock().unwrap().leaving}
 pub fn current(&self,ticket:u64)->bool{self.0.lock().unwrap().generation==ticket}
 pub fn commit(&self,ticket:u64)->bool{let mut s=self.0.lock().unwrap();if !s.leaving||s.generation!=ticket{return false;}s.leaving=false;true}
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn duplicate_status_cannot_restart_an_exit(){let h=HomeTransition::default();let ticket=h.begin().unwrap();for _ in 0..100{assert_eq!(h.begin(),None);}assert!(h.commit(ticket));assert!(!h.commit(ticket));}
 #[test]fn explicit_reopen_cancels_a_pending_native_hide(){let h=HomeTransition::default();let ticket=h.begin().unwrap();h.cancel();assert!(!h.commit(ticket));let next=h.begin().unwrap();assert_ne!(ticket,next);assert!(h.commit(next));}
 #[test]fn hide_commits_without_any_browser_animation_acknowledgement(){let h=HomeTransition::default();let ticket=h.begin().unwrap();assert!(h.commit(ticket));}
}
