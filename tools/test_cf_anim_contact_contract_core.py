import unittest,numpy as np
from cf_anim_contact_contract_core import phases,feasible_step
class Contract(unittest.TestCase):
    def test_static(self):
        r=phases(np.zeros((6,3)),1/24,1)
        self.assertEqual(r["windows"],[[0,5]])
        self.assertEqual(r["phases"],["plant"]*6)
    def test_moving_not_plant(self):
        p=np.zeros((8,3));p[:,2]=np.arange(8)*.1
        self.assertEqual(phases(p,1/24,1)["windows"],[])
    def test_invalid(self):
        with self.assertRaises(ValueError):phases(np.zeros((2,3)),1,1)
    def test_restoration(self):
        self.assertTrue(feasible_step([[.08,0]],[[.04,0]]))
        self.assertFalse(feasible_step([[.08,0]],[[.02,.01]]))
        self.assertFalse(feasible_step([[.02,0]],[[.03,0]]))
        self.assertFalse(feasible_step([[0,0]],[[float("nan"),0]]))
    def test_no_hidden_trade(self):
        self.assertFalse(feasible_step([[.02,0],[.03,0]],[[0,0],[.04,0]]))
if __name__=="__main__":unittest.main()
