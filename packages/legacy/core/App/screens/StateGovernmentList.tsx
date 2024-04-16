import { StackNavigationProp } from '@react-navigation/stack'
import React from 'react'
import { FlatList, View, StyleSheet } from 'react-native'

import InstitutionCard from '../components/institution/InstitutionCard'
import { InstitutionRegistry, InstitutionCategoryType, InstitutionDetail } from '../data/institutions-data'
import { RootStackParamList } from '../types/navigators'

type StateGovernmentScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'StateGovernmentScreen'>
}

const StateGovernmentScreen: React.FC<StateGovernmentScreenProps> = ({ navigation }) => {
  const categoryType = InstitutionCategoryType.StateGovernment

  const stateGovernmentInstitutions =
    InstitutionRegistry.find((category) => category.type === categoryType)?.institutions || []

  const renderInstitution = ({ item }: { item: InstitutionDetail }) => (
    <InstitutionCard
      institution={item}
      onPress={() => {
        navigation.navigate('InstitutionDetail', {
          institutionId: item.id,
          categoryType: categoryType,
        })
      }}
    />
  )

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      marginTop: 10,
    },
    // Other styles can be added here
  })

  return (
    <View style={styles.container}>
      <FlatList
        data={stateGovernmentInstitutions}
        renderItem={renderInstitution}
        keyExtractor={(item) => item.id.toString()}
        // Add other props such as ItemSeparatorComponent if needed
      />
    </View>
  )
}

export default StateGovernmentScreen
